import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function envHost() {
  if (process.env.POSTGRES_HOST) return process.env.POSTGRES_HOST
  const file = join(root, '.env')
  if (!existsSync(file)) return 'localhost'
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('POSTGRES_HOST='))
  return line ? line.split('=')[1].trim() : 'localhost'
}

const host = envHost()
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.log(`db: POSTGRES_HOST=${host} - remote, skipping local server`)
  process.exit(0)
}

if (process.platform === 'win32') {
  console.log('db: windows - skipping scripts/db.sh, start postgres yourself')
  process.exit(0)
}

const r = spawnSync('./scripts/db.sh', ['start'], { cwd: root, stdio: 'inherit' })
process.exit(r.status ?? 1)
