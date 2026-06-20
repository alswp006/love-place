// 초대 코드 유틸 — 서버(gen_invite_code)와 동일 규칙(8자 Base32, 혼동문자 제외).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 입력 정규화: 대문자 + 영숫자만(하이픈/공백/소문자 흡수). 서버 정규화와 동일. */
export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** 표시용 4-4 하이픈 분할(예: ABCD-2345). */
export function formatInviteCode(code: string): string {
  const n = normalizeInviteCode(code)
  return n.length === 8 ? `${n.slice(0, 4)}-${n.slice(4)}` : n
}

/** 8자 + 허용 문자셋 검증(제출 전 클라 가드). */
export function isValidInviteCode(raw: string): boolean {
  const n = normalizeInviteCode(raw)
  return n.length === 8 && [...n].every((c) => ALPHABET.includes(c))
}

/** 카톡 등 공유 텍스트. */
export function inviteShareText(code: string): string {
  return `우리 여행앱 love place에서 연결해요! 초대코드: ${formatInviteCode(code)} (48시간 내 입력)`
}

/** 정규화된 문자열에서 첫 유효 8자 윈도우(없으면 null). */
function firstValidWindow(compact: string): string | null {
  for (let i = 0; i + 8 <= compact.length; i++) {
    const window = compact.slice(i, i + 8)
    if (isValidInviteCode(window)) return window
  }
  return null
}

/**
 * 공유 텍스트에서 유효한 8자 초대코드를 추출(없으면 null). 붙여넣기 자동 채움/제출용.
 * 앱 공유 문구는 'love place' 같은 브랜딩 문자열이 유효 Base32 윈도우(예: VEPLACEA)를
 * 만들 수 있어, '초대코드' 라벨 뒤 구간을 먼저 탐색해 오추출을 막는다.
 * 라벨이 없거나 라벨 뒤에서 못 찾으면 전체에서 첫 유효 윈도우로 폴백.
 */
export function extractInviteCode(raw: string): string | null {
  const labelMatch = raw.match(/초대\s*코드[^A-Za-z0-9]*/)
  if (labelMatch && labelMatch.index !== undefined) {
    const after = normalizeInviteCode(raw.slice(labelMatch.index + labelMatch[0].length))
    const found = firstValidWindow(after)
    if (found) return found
  }
  const compact = normalizeInviteCode(raw)
  if (compact.length < 8) return null
  return firstValidWindow(compact)
}
