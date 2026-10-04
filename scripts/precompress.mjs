// Pre-compresses the built files (gzip + brotli) so the server sends them without compressing
// on every request. Usage: node scripts/precompress.mjs (run by `npm run build`).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const TEXT = /\.(js|mjs|css|html|json|svg|txt|xml|wasm)$/
let n = 0
let saved = 0
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p)
    else if (TEXT.test(name) && s.size > 1024) {
      const buf = readFileSync(p)
      const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: s.size > 2e6 ? 9 : 11 } })
      writeFileSync(`${p}.br`, br)
      writeFileSync(`${p}.gz`, gzipSync(buf, { level: 9 }))
      n++
      saved += s.size - br.length
    }
  }
}
walk('dist')
console.log(`precompressed ${n} files (brotli saves ${(saved / 1e6).toFixed(1)} MB)`)
