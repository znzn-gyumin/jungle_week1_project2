import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const uvicorn =
  process.platform === 'win32'
    ? join(root, '.venv', 'Scripts', 'uvicorn.exe')
    : join(root, '.venv', 'bin', 'uvicorn')

const bin = existsSync(uvicorn) ? uvicorn : 'uvicorn'
const serve = [bin, 'backend.main:app', '--host', '127.0.0.1', '--port', '8000']

// uvicorn 자체 --reload 를 쓰지 않는다. Windows 에서 재시작할 때 콘솔 프로세스
// 그룹 전체에 CTRL_C 를 보내는데, concurrently 로 같은 콘솔에 붙은 pages·devlab
// 이 그걸 같이 받고 죽는다 (cmd 래퍼가 있으면 "일괄 작업을 끝내시겠습니까"
// 프롬프트까지 뜬다). 재시작은 nodemon 이 프로세스를 직접 죽였다 살리는 방식
// 이라 그 신호가 생기지 않는다.
const nodemon = join(root, 'node_modules', 'nodemon', 'bin', 'nodemon.js')

const args = [
  nodemon,
  '--quiet',
  '--watch',
  'backend',
  '--watch',
  '.env',
  '--ext',
  'py',
  '--exec',
  serve.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' '),
  ...process.argv.slice(2),
]

const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' })
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
