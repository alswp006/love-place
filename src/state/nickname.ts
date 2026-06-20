// 상대 로컬 별명 — display_name이 빈값일 때만 보조로 쓰는 로컬 표시명(공유 X, 내 기기에만).
// localStorage 키 `lp_nick_<partnerId>`. SSR/비지원 환경 가드.
const PREFIX = 'lp_nick_'

export function getNickname(partnerId: string): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(PREFIX + partnerId)
  } catch {
    return null
  }
}

export function setNickname(partnerId: string, value: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    const v = value.trim()
    if (v) localStorage.setItem(PREFIX + partnerId, v)
    else localStorage.removeItem(PREFIX + partnerId)
  } catch {
    // 저장 실패는 무시(별명은 보조 기능).
  }
}
