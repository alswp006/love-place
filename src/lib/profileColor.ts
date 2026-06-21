export type PaletteEntry = { hex: string; label: string }
// 사람 색(아바타·출처점) 팔레트 — 마시멜로 아바타페어 4색(핑크/옐로/민트/라벤더), 색+이름 라벨 이중화(§8).
// 2인 앱이라 실사용은 2명. 출처점은 색 단독이 아니라 이니셜/아바타 동반. 캘린더 트랙 색과 일관(track.ts).
export const PROFILE_PALETTE: PaletteEntry[] = [
  { hex: '#6e5aa8', label: '라벤더' },
  { hex: '#b85a78', label: '핑크' },
  { hex: '#3e8e70', label: '민트' },
  { hex: '#b0852a', label: '옐로' },
]
export function defaultColorForRole(role: 'user_a' | 'user_b'): string {
  // user_a=라벤더, user_b=핑크(트랙색과의 충돌 회피 배정, 마시멜로 도입 spec §3).
  return role === 'user_a' ? '#6e5aa8' : '#b85a78'
}
