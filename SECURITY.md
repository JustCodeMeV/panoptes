# Security

## Secrets

- **Where they live:** environment variables only. Production: the Render dashboard
  (`render.yaml` declares each one with `sync: false`, so values never enter git).
  Local: a `.env` file (git-ignored, keep it `chmod 600`). `.env.example` lists the
  names with empty values.
- **Never leave the server:** the browser bundle reads no environment variables;
  every third-party call (Claude, ACLED, FIRMS, Cloudflare, YouTube, Google) is made
  server-side. API responses and logs pass through `redact()`
  (`server/core/secrets.ts`), which scrubs configured secret values, API-key
  patterns, bearer tokens and `?key=` parameters. Start-up logs name the configured
  secrets, never their values.
- **Missing keys are not errors:** keyed sources show as *off* and are never called.
- **Scanning:** `.github/workflows/secret-scan.yml` runs gitleaks over the full
  history on every push and PR. Locally, install the hook once:
  `cp scripts/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.
  It refuses `.env` files and anything shaped like a credential.
- **If a secret leaks:** rotate it at the provider first, then update Render and
  `.env`. Removing it from git history does not un-leak it.

## Abuse limits

- Endpoints that spend money or upstream quota are rate-limited per client IP
  (AI briefs 20 / 10 min, claim checks 30 / 10 min); Claude calls are also capped
  per hour overall (`PANOPTES_LLM_MAX_PER_HOUR`, default 60).
- API request bodies are capped at 512 KB; security headers (HSTS, nosniff,
  frame and opener isolation) are set on every response.

## Known limits

- Case file, watches and notes have no login: anyone with the URL can read and edit
  them. Fine for a demo; put the service behind auth before real casework.
