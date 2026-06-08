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
