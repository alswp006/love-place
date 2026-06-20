// 상대 표시 보조 — 함께한 지 D+N / 빈 이름 폴백(dossier 02 §4, R3.4).

// 연결 이후 경과일(D+N). connectedAt 없으면 null.
export function daysTogether(connectedAt: string | null, now: Date = new Date()): number | null {
  if (!connectedAt) return null
  const start = new Date(connectedAt).getTime()
  if (Number.isNaN(start)) return null
  const ms = now.getTime() - start
  return Math.max(0, Math.floor(ms / 86_400_000))
}

// 표시 이름: display_name → (빈값이면) 로컬 닉네임 → '상대'.
export function partnerLabel(p: { displayName: string }, nickname: string | null): string {
  if (p.displayName.trim()) return p.displayName.trim()
  if (nickname && nickname.trim()) return nickname.trim()
  return '상대'
}
