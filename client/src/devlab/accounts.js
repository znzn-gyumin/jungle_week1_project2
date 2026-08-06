const KEY = 'devlab:accounts'
const SEQ = 'devlab:seq'

export const DEV_PASSWORD = 'devlab-pw-0000'

export function listAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(accounts) {
  localStorage.setItem(KEY, JSON.stringify(accounts.slice(0, 20)))
}

export function saveAccount(account) {
  const kept = listAccounts().filter((a) => a.email !== account.email)
  write([...kept, account])
}

export function updateAccount(email, patch) {
  write(listAccounts().map((a) => (a.email === email ? { ...a, ...patch } : a)))
}

export function forgetAccount(email) {
  write(listAccounts().filter((a) => a.email !== email))
}

export function forgetAll() {
  localStorage.removeItem(KEY)
}

export function nextIdentity() {
  const seq = Number(localStorage.getItem(SEQ) ?? '0') + 1
  localStorage.setItem(SEQ, String(seq))
  return {
    nickname: `테스터${seq}`,
    email: `tester${seq}@devlab.test`,
    password: DEV_PASSWORD,
  }
}
