/**
 * Secrets live only in environment variables (Render dashboard in production,
 * a git-ignored `.env` locally) and never leave the server: they are not
 * logged, not returned by the API and not bundled into the client.
 * `redact` is the last line of defence for any string that might echo one
 * back (an upstream error message, a URL with a key in it).
 */
export const SECRET_ENV = [
  'ANTHROPIC_API_KEY',
  'ACLED_EMAIL',
  'ACLED_PASSWORD',
  'FIRMS_MAP_KEY',
  'CLOUDFLARE_RADAR_TOKEN',
  'YOUTUBE_API_KEY',
  'GOOGLE_FACTCHECK_API_KEY',
] as const

const PATTERNS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]{10,}/g, '[redacted]'], // Anthropic keys
  [/AIza[0-9A-Za-z_-]{30,}/g, '[redacted]'], // Google API keys
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [redacted]'], // auth headers
  [/([?&](?:key|api_key|apikey|token|access_token|password)=)[^&\s"']+/gi, '$1[redacted]'], // secrets in query strings
]

export function redact(text: string): string {
  let out = text
  for (const name of SECRET_ENV) {
    const v = process.env[name]
    if (v && v.length >= 6) out = out.split(v).join(`[${name}]`)
  }
  for (const [re, by] of PATTERNS) out = out.replace(re, by)
  return out
}

/** Which secrets are configured, without their values: for start-up logs and diagnostics. */
export const configuredSecrets = () => SECRET_ENV.filter((n) => !!process.env[n])
