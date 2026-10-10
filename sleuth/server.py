"""
SLEUTH TOOL SERVER: runs the geo-sleuth scripts (vendored, unmodified, in ./geo-sleuth) for ARGUS.

ARGUS's agent decides what to run; this server only executes allowlisted script + subcommand pairs,
each in a workspace directory per investigation run, and serves the files they produce.
No shell: arguments go to the script as a list. Paths must stay inside the run's workspace.

  POST   /run                 {"run": id, "script": "board", "args": ["rank"], "timeout": 120}
  PUT    /photo/<run>/<name>  raw image body (the photo under investigation)
  GET    /file/<run>/<path>   an artifact produced by a script (?max=1280: images downscaled to JPEG)
  GET    /ls/<run>[/<dir>]    files in the workspace
  GET    /skill/<path>        the skill's own docs and tables (SKILL.md, references/, regions/, data/)
  DELETE /run/<run>           drop the workspace
  GET    /health

Auth: "Authorization: Bearer $SLEUTH_TOKEN" (required unless SLEUTH_DEV=1, for local runs).
Standard library only, so the image carries just the scripts' own dependencies.
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from io import BytesIO
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE / "geo-sleuth" / "skills" / "geo-sleuth"
SCRIPTS = SKILL / "scripts"
WORK = Path(os.environ.get("SLEUTH_WORK_DIR", "/tmp/sleuth")).resolve()
TOKEN = os.environ.get("SLEUTH_TOKEN", "")
DEV = os.environ.get("SLEUTH_DEV") == "1"
PORT = int(os.environ.get("PORT", "8790"))
MAX_UPLOAD = 25 * 1024 * 1024
MAX_OUT = 30_000
KEEP_S = 24 * 3600

# script -> allowed subcommands (None: the script takes no subcommand). refresh.py (maintainers) is left out.
ALLOW: dict[str, set[str] | None] = {
    "intake": None, "exif": None, "ocr": None, "revimg": None, "poi": None, "evidence": None, "doctor": None,
    "board": {"init", "country", "add", "children", "clue", "evidence", "exclude", "scan-bbox", "urban", "falsify",
              "rank", "next", "check", "report", "apply", "move", "log"},
    "clues": {"lookup", "list"},
    "regions": {"list", "show", "lint"},
    "gazetteer": {"children", "info", "urban", "cost"},
    "geo": {"convert", "bearing", "dest", "range", "fov", "line", "intersect", "frame", "bearings", "spacing"},
    "imgprep": {"zoom", "edges", "variants", "grid", "piers"},
    "osm": {"find", "near", "crossings", "route", "raw", "intersect", "coverage", "along", "buildings", "geom", "street-scan"},
    "sun": {"pos", "ratio", "locate", "when", "dish", "street", "facing", "compass"},
    "terrain": {"elev", "view", "profile", "scan", "ridge", "fit"},
    "tiles": {"fetch", "mark", "sheet", "px"},
    "pose": {"solve", "check", "project"},
    "gsv": {"near", "render", "sheet"},
    "baidu_pano": {"near", "info", "scan", "render", "sheet", "sample"},
    "sat_scan": {"grid", "points", "presets"},
    "match": {"rank", "index"},
}
# Scripts that load ML models or drive a browser get longer limits
SLOW = {"intake": 900, "sat_scan": 900, "match": 900, "revimg": 300, "terrain": 600, "osm": 300}
RUN_ID = re.compile(r"^[a-z0-9][a-z0-9-]{7,63}$")
PHOTO = re.compile(r"^[\w.-]{1,80}\.(jpe?g|png|webp|heic|gif)$", re.I)

locks: dict[str, threading.Lock] = {}
locks_guard = threading.Lock()


def lock_for(run: str) -> threading.Lock:
    with locks_guard:
        return locks.setdefault(run, threading.Lock())


def workspace(run: str) -> Path:
    if not RUN_ID.match(run):
        raise ValueError("bad run id")
    d = WORK / run
    d.mkdir(parents=True, exist_ok=True)
    return d


def inside(base: Path, rel: str) -> Path:
    p = (base / rel).resolve()
    if p != base and base not in p.parents:
        raise ValueError("path outside the workspace")
    return p


def check_arg(a: str) -> None:
    """Arguments may name files only inside the workspace: no absolute paths, no parent references."""
    if not isinstance(a, str) or len(a) > 2000 or "\x00" in a:
        raise ValueError("bad argument")
    if re.match(r"^https?://", a):
        return
    value = a.split("=", 1)[1] if a.startswith("--") and "=" in a else a
    for part in re.split(r"[,:;]", value):
        if part.startswith(("/", "~")) or ".." in Path(part).parts:
            raise ValueError(f"argument leaves the workspace: {a[:80]}")


def snapshot(d: Path) -> dict[str, float]:
    out = {}
    for p in d.rglob("*"):
        if p.is_file() and ".geo-cache" not in p.parts:
            out[str(p.relative_to(d))] = p.stat().st_mtime
    return out


def run_script(body: dict) -> dict:
    run, script, args = body.get("run", ""), str(body.get("script", "")).removesuffix(".py"), body.get("args", [])
    if script not in ALLOW:
        raise ValueError(f"script not allowed: {script}")
    if not isinstance(args, list):
        raise ValueError("args must be a list")
    subs = ALLOW[script]
    if subs is not None and (not args or args[0] not in subs):
        raise ValueError(f"{script}: subcommand must be one of {sorted(subs)}")
    for a in args:
        check_arg(a)
    limit = min(int(body.get("timeout") or SLOW.get(script, 180)), SLOW.get(script, 180))
    d = workspace(run)
    env = {
        "PATH": os.environ.get("PATH", ""), "HOME": str(d), "PYTHONUTF8": "1", "LANG": "C.UTF-8",
        "CLAUDE_SKILL_DIR": str(SKILL), "UV": str(HERE / "uv-shim"), "SLEUTH_PYTHON": sys.executable,
        "HF_HOME": os.environ.get("HF_HOME", str(HERE / ".hf")), "HF_HUB_OFFLINE": os.environ.get("HF_HUB_OFFLINE", "0"),
        # HOME is the workspace, so point Playwright at the browsers installed for the server's own user
        "PLAYWRIGHT_BROWSERS_PATH": os.environ.get("PLAYWRIGHT_BROWSERS_PATH") or str(Path.home() / ".cache" / "ms-playwright"),
        "GEO_PROXY": os.environ.get("GEO_PROXY", ""),
    }
    with lock_for(run):
        before = snapshot(d)
        t0 = time.time()
        try:
            r = subprocess.run([sys.executable, str(SCRIPTS / f"{script}.py"), *args], cwd=d, env=env, text=True,
                               encoding="utf-8", errors="replace", capture_output=True, timeout=limit)
            code, out, err = r.returncode, r.stdout, r.stderr
        except subprocess.TimeoutExpired as e:
            code, out, err = 124, (e.stdout or "") if isinstance(e.stdout, str) else "", f"timed out after {limit}s"
        after = snapshot(d)
    files = sorted(k for k, m in after.items() if before.get(k) != m)
    return {"code": code, "ms": int((time.time() - t0) * 1000), "stdout": out[-MAX_OUT:], "stderr": err[-8000:],
            "truncated": len(out) > MAX_OUT, "files": files[:200]}


def downscale(p: Path, longest: int) -> tuple[bytes, str]:
    """Images for the model: longest side capped, JPEG; spares tokens on full-resolution photos."""
    from PIL import Image  # the scripts' own dependency
    with Image.open(p) as im:
        im = im.convert("RGB")
        im.thumbnail((longest, longest))
        buf = BytesIO()
        im.save(buf, "JPEG", quality=85)
    return buf.getvalue(), "image/jpeg"


def gc_loop() -> None:
    while True:
        time.sleep(1800)
        if not WORK.exists():
            continue
        for d in WORK.iterdir():
            if d.is_dir() and time.time() - d.stat().st_mtime > KEEP_S:
                shutil.rmtree(d, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "sleuth"

    def log_message(self, fmt, *a):  # one line per request, no bodies
        sys.stderr.write(f"[sleuth] {self.command} {self.path.split('?')[0]} {a[1] if len(a) > 1 else ''}\n")

    def send(self, status: int, obj=None, raw: bytes | None = None, ctype="application/json"):
        data = raw if raw is not None else json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authed(self) -> bool:
        if DEV and not TOKEN:
            return True
        ok = bool(TOKEN) and self.headers.get("Authorization", "") == f"Bearer {TOKEN}"
        if not ok:
            self.send(401, {"error": "unauthorized"})
        return ok

    def body(self, limit: int) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("body too large")
        return self.rfile.read(n)

    def do_GET(self):
        if self.path == "/health":
            return self.send(200, {"ok": True, "skill": (HERE / "geo-sleuth" / "COMMIT").read_text().strip()})
        if not self.authed():
            return
        path, _, query = self.path.partition("?")
        try:
            if m := re.match(r"^/skill/(.+)$", path):
                p = inside(SKILL, m.group(1))
                if not p.is_file() or p.suffix not in (".md", ".json"):
                    return self.send(404, {"error": "no such skill file"})
                return self.send(200, raw=p.read_bytes(), ctype="text/plain; charset=utf-8")
            if m := re.match(r"^/ls/([^/]+)(?:/(.*))?$", path):
                base = workspace(m.group(1))
                d = inside(base, m.group(2) or ".")
                files = sorted(str(f.relative_to(base)) for f in d.rglob("*") if f.is_file() and ".geo-cache" not in f.parts)
                return self.send(200, {"files": files[:500], "total": len(files)})
            m = re.match(r"^/file/([^/]+)/(.+)$", path)
            if not m:
                return self.send(404, {"error": "not found"})
            p = inside(workspace(m.group(1)), m.group(2))
        except ValueError as e:
            return self.send(400, {"error": str(e)})
        if not p.is_file():
            return self.send(404, {"error": "no such file"})
        longest = re.search(r"(?:^|&)max=(\d+)", query)
        if longest and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"):
            data, ctype = downscale(p, max(256, min(int(longest.group(1)), 2048)))
            return self.send(200, raw=data, ctype=ctype)
        self.send(200, raw=p.read_bytes(), ctype=mimetypes.guess_type(p.name)[0] or "application/octet-stream")

    def do_POST(self):
        if not self.authed():
            return
        if self.path != "/run":
            return self.send(404, {"error": "not found"})
        try:
            self.send(200, run_script(json.loads(self.body(1_000_000) or b"{}")))
        except (ValueError, json.JSONDecodeError) as e:
            self.send(400, {"error": str(e)})

    def do_PUT(self):
        if not self.authed():
            return
        m = re.match(r"^/photo/([^/]+)/([^/]+)$", self.path)
        if not m or not PHOTO.match(m.group(2)):
            return self.send(400, {"error": "PUT /photo/<run>/<name.jpg|png|webp|heic|gif>"})
        try:
            data = self.body(MAX_UPLOAD)
            p = inside(workspace(m.group(1)), m.group(2))
        except ValueError as e:
            return self.send(400, {"error": str(e)})
        p.write_bytes(data)
        self.send(200, {"path": m.group(2), "bytes": len(data)})

    def do_DELETE(self):
        if not self.authed():
            return
        m = re.match(r"^/run/([^/]+)$", self.path)
        if not m or not RUN_ID.match(m.group(1)):
            return self.send(400, {"error": "bad run id"})
        shutil.rmtree(WORK / m.group(1), ignore_errors=True)
        self.send(200, {"ok": True})


if __name__ == "__main__":
    if not TOKEN and not DEV:
        sys.exit("SLEUTH_TOKEN is not set (set SLEUTH_DEV=1 for a local run without auth)")
    WORK.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=gc_loop, daemon=True).start()
    host = os.environ.get("HOST", "127.0.0.1" if DEV else "0.0.0.0")
    print(f"[sleuth] listening on http://{host}:{PORT} (skill {SKILL})", flush=True)
    ThreadingHTTPServer((host, PORT), Handler).serve_forever()
