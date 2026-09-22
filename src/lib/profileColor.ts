import { LEGACY_PROFILE_SWATCHES, WEAVE_PALETTE, type PaletteEntry } from './colorPalette'

export type { PaletteEntry }

// 사람 색(아바타·출처점) 팔레트 — **분류 색과 같은 목록**을 쓴다(colorPalette.ts).
// 색+이름 라벨 이중화(§8). 출처점은 색 단독이 아니라 이니셜/아바타 동반.
export const PROFILE_PALETTE: readonly PaletteEntry[] = WEAVE_PALETTE

/** 역할별 기본색. user_a=라벤더, user_b=코럴 — 트랙 색과의 충돌을 피하는 배정.
 *
 *  ★ 반드시 **PROFILE_PALETTE 안의 값**이어야 한다. 목록 밖 값을 돌려주면 처음 연 사람이
 *    '아무것도 안 골라진 색 고르개'를 본다(이 앱이 예전에 실제로 그랬다).
 *
 *  코럴인 이유: 팔레트의 '핑크'(#e2638a)는 브랜드색이자 상대 트랙색이라, 그걸 기본으로
 *  주면 내 프로필이 상대 트랙으로 읽힌다. */
export function defaultColorForRole(role: 'user_a' | 'user_b'): string {
  return role === 'user_a' ? '#8b6ec8' : '#c86b6b'
}

/** 색 고르개에 깔 견본들 — 팔레트 + **지금 값이 목록에 없으면 그것도 한 칸.**
 *
 *  예전 팔레트 색을 쓰던 사람이 고르개를 열면 아무것도 안 골라진 화면을 본다.
 *  골라져 있지 않으면 "내 색이 지워졌나?"로 읽히고, 아무 색이나 누르면 예전 색은
 *  되돌릴 수 없다(목록에 없으니까). 그래서 지금 값을 맨 앞에 덧붙인다.
 *
 *  이름에 '(지금 색)'을 붙이는 이유: 옛 라벤더(#6e5aa8)와 새 라벤더(#8b6ec8)는 이름이
 *  같다. 그대로 두면 견본 두 칸이 스크린리더에 똑같이 '라벤더'로 읽혀 어느 쪽이 지금
 *  내 색인지 알 방법이 없다 — 색만으로 구분하지 않는다는 규칙(§8)이 이름에도 적용된다. */
export function swatchesFor(current: string | null | undefined): readonly PaletteEntry[] {
  const cur = current?.toLowerCase()
  if (!cur || PROFILE_PALETTE.some((e) => e.hex === cur)) return PROFILE_PALETTE
  const legacy = LEGACY_PROFILE_SWATCHES.find((e) => e.hex === cur)
  return [
    { hex: cur, label: legacy ? `${legacy.label}(지금 색)` : '지금 색' },
    ...PROFILE_PALETTE,
  ]
}
