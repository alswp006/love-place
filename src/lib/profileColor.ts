export type PaletteEntry = { hex: string; label: string }
// 사람 색(아바타·출처점·마커) 팔레트 — 색+이름 라벨 이중화(§8). 캘린더 3트랙 색과는 별개(track.ts).
export const PROFILE_PALETTE: PaletteEntry[] = [
  { hex: '#3b6db5', label: '블루' },
  { hex: '#c25d86', label: '핑크' },
  { hex: '#7a5bb0', label: '퍼플' },
  { hex: '#3f9e7c', label: '그린' },
  { hex: '#d08a3e', label: '앰버' },
  { hex: '#5b6b7a', label: '슬레이트' },
]
export function defaultColorForRole(role: 'user_a' | 'user_b'): string {
  return role === 'user_a' ? '#3b6db5' : '#c25d86'
}
