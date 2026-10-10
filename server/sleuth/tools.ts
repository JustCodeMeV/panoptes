import type Anthropic from '@anthropic-ai/sdk'
import type { ToolOutcome } from './agent.ts'

/**
 * The tool server (sleuth/server.py) runs the geo-sleuth scripts; this is its client and the tools
 * Claude gets. The tools are deliberately generic: the skill's own instructions name commands
 * (`uv run …/scripts/board.py rank`), and `run_script` maps one to one, so SKILL.md works unchanged.
 */

const BASE = (process.env.SLEUTH_URL || 'http://127.0.0.1:8790').replace(/\/$/, '')
const headers = (): Record<string, string> => (process.env.SLEUTH_TOKEN ? { Authorization: `Bearer ${process.env.SLEUTH_TOKEN}` } : {})

async function call(path: string, init: RequestInit = {}, ms = 30_000): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers(), ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(ms) })
  if (!res.ok && res.status !== 404) throw new Error(`tool server ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res
}

export type ScriptResult = { code: number; ms: number; stdout: string; stderr: string; truncated: boolean; files: string[] }

export const toolServer = {
  async health(): Promise<boolean> {
    return call('/health', {}, 3000).then((r) => r.ok).catch(() => false)
  },
  async putPhoto(run: string, name: string, data: Uint8Array): Promise<void> {
    await call(`/photo/${run}/${name}`, { method: 'PUT', body: data }, 60_000)
  },
  async run(run: string, script: string, args: string[]): Promise<ScriptResult> {
    const res = await call('/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run, script, args }) }, 16 * 60_000)
    const j = (await res.json()) as ScriptResult & { error?: string }
    if (j.error) throw new Error(j.error)
    return j
  },
  async text(run: string, path: string): Promise<string | null> {
    const res = await call(`/file/${run}/${encodePath(path)}`)
    return res.ok ? res.text() : null
  },
  async image(run: string, path: string, max = 1280): Promise<{ data: string; type: string } | null> {
    const res = await call(`/file/${run}/${encodePath(path)}?max=${max}`)
    if (!res.ok) return null
    return { data: Buffer.from(await res.arrayBuffer()).toString('base64'), type: res.headers.get('content-type') || 'image/jpeg' }
  },
  /** Raw artifact for the browser (evidence images, contact sheets). */
  async file(run: string, path: string, max?: number): Promise<Response> {
    return call(`/file/${run}/${encodePath(path)}${max ? `?max=${max}` : ''}`)
  },
  async list(run: string, dir = ''): Promise<{ files: string[]; total: number }> {
    return (await call(`/ls/${run}${dir ? `/${encodePath(dir)}` : ''}`)).json() as Promise<{ files: string[]; total: number }>
  },
  async skill(path: string): Promise<string | null> {
    const res = await call(`/skill/${encodePath(path)}`)
    return res.ok ? res.text() : null
  },
  async drop(run: string): Promise<void> {
    await call(`/run/${run}`, { method: 'DELETE' }).catch(() => {})
  },
}
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

// Tool outputs go back into the conversation: keep them short, the full files stay readable on demand
const MAX_STDOUT = 6000
const MAX_TEXT = 14_000

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'run_script',
    description:
      'Run one geo-sleuth script in this investigation\'s workspace. A skill command `uv run ${CLAUDE_SKILL_DIR}/scripts/<script>.py <args…>` is called as {script: "<script>", args: [<args…>]}. Paths are relative to the workspace (the photo is photo.jpg). Returns exit code, stdout (truncated) and the files it wrote.',
    input_schema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'Script name without .py, e.g. board, clues, osm, sun, geo, terrain, pose, sat_scan, match, gsv, poi, tiles, evidence, imgprep, ocr, revimg, gazetteer, regions' },
        args: { type: 'array', items: { type: 'string' }, description: 'Arguments, one per item, exactly as on the command line' },
      },
      required: ['script', 'args'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_file',
    description: 'Read a text file from the workspace (JSON, Markdown, CSV), e.g. intake/intake.md or a script\'s --out file.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
  },
  {
    name: 'view_image',
    description: 'Look at an image from the workspace: the photo, a crop, a contact sheet, a satellite mosaic, a street-view render or an evidence image. Look only at what the scripts ranked first.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, max: { type: 'integer', description: 'Longest side in pixels, 512-2048 (default 1280). Use larger only to read fine detail.' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_files',
    description: 'List files in the workspace or one of its directories.',
    input_schema: { type: 'object', properties: { dir: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'read_skill_file',
    description: 'Read one of the skill\'s own reference files, e.g. references/geometry.md, references/clues/global.md, regions/jp/clues.md. Read only the sections you need.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
  },
]

type Input = { script?: string; args?: string[]; path?: string; max?: number; dir?: string }

/** Runs one tool call; failures come back as an error result for Claude, never as an exception. */
export async function execTool(run: string, name: string, raw: unknown): Promise<ToolOutcome> {
  const txt = (text: string): ToolOutcome['content'] => [{ type: 'text', text }]
  const input = (raw ?? {}) as Input
  try {
    switch (name) {
      case 'run_script': {
        const args = Array.isArray(input.args) ? input.args.map(String) : []
        const r = await toolServer.run(run, String(input.script ?? ''), args)
        const out = r.stdout.length > MAX_STDOUT ? `…(${r.stdout.length - MAX_STDOUT} chars cut; write --out to a file and read_file it)\n${r.stdout.slice(-MAX_STDOUT)}` : r.stdout
        const files = r.files.filter((f) => !f.startsWith('.cache/'))
        const text = [`exit ${r.code} in ${(r.ms / 1000).toFixed(1)}s`, out, r.stderr && `stderr:\n${r.stderr.slice(-1500)}`, files.length && `files written: ${files.slice(0, 40).join(', ')}${files.length > 40 ? ` (+${files.length - 40})` : ''}`].filter(Boolean).join('\n')
        return { content: txt(text), isError: r.code !== 0, summary: `${input.script} ${args.join(' ')}`.slice(0, 200) }
      }
      case 'read_file': {
        const t = await toolServer.text(run, String(input.path))
        if (t === null) return { content: txt(`no such file: ${input.path}`), isError: true, summary: `read ${input.path}` }
        return { content: txt(t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}\n…(${t.length - MAX_TEXT} chars cut)` : t), isError: false, summary: `read ${input.path}` }
      }
      case 'view_image': {
        const img = await toolServer.image(run, String(input.path), Math.max(512, Math.min(Number(input.max) || 1280, 2048)))
        if (!img) return { content: txt(`no such image: ${input.path}`), isError: true, summary: `view ${input.path}` }
        return {
          content: [{ type: 'image', mime: img.type, data: img.data }],
          isError: false,
          summary: `view ${input.path}`,
        }
      }
      case 'list_files': {
        const l = await toolServer.list(run, input.dir ? String(input.dir) : '')
        return { content: txt(`${l.files.join('\n')}${l.total > l.files.length ? `\n…(${l.total - l.files.length} more)` : ''}`), isError: false, summary: `ls ${input.dir ?? ''}` }
      }
      case 'read_skill_file': {
        const t = await toolServer.skill(String(input.path))
        if (t === null) return { content: txt(`no such skill file: ${input.path}`), isError: true, summary: `skill ${input.path}` }
        return { content: txt(t.length > MAX_TEXT * 3 ? `${t.slice(0, MAX_TEXT * 3)}\n…(cut)` : t), isError: false, summary: `skill ${input.path}` }
      }
      default:
        return { content: txt(`unknown tool ${name}`), isError: true, summary: name }
    }
  } catch (e) {
    return { content: txt(`failed: ${e instanceof Error ? e.message : String(e)}`), isError: true, summary: `${name} failed` }
  }
}
