import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// PORT 는 외부 도구(프리뷰 러너 등)가 덮어쓰는 일이 있어 그대로 두면 vite 의
// 5173 에 붙어버린다. 페이지 서버 포트는 PAGES_PORT 로만 바꾼다.
const env = { ...process.env, PORT: process.env.PAGES_PORT || '3001' }

const nodemon = join(root, 'node_modules', 'nodemon', 'bin', 'nodemon.js')
const child = spawn(process.execPath, [nodemon, '--watch', 'app.js', 'app.js'], {
  cwd: root,
  stdio: 'inherit',
  env,
})
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
