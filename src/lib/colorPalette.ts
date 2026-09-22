// 색 한 벌 — **분류 색과 프로필 색이 같은 목록을 쓴다.**
//
// ⚠️ Flutter판 `app/lib/core/color_palette.dart`의 이식. 두 앱이 같은 색을 보여줘야 하므로
//    한쪽만 고치지 말 것.
//
// ## 왜 합치나
//
// 두 곳이 각자 목록을 들고 있었다(분류 6색 / 프로필 4색). 이름은 같은데 hex가 달라서,
// 프로필을 민트로 하고 분류도 민트로 하면 **서로 다른 민트** 둘이 한 화면에 떴다.
// 같은 이름이 같은 색이 아닌 건 그 자체로 버그다.
//
// ## 진한 톤과 파스텔 톤을 짝으로
//
// 한 색조마다 둘을 둔다. 진한 쪽은 또렷하고 파스텔 쪽은 부드럽다 — 둘 다 필요하다.
// 분류를 열 개쯤 만들면 진한 색만으로는 화면이 무거워지고, 파스텔만으로는 구분이 흐려진다.
//
// ## 파스텔이 대비를 깨지 않는 이유
//
// 저장되는 값은 **한 색**인데 화면에서는 셋으로 쓰인다: 채운 면, 그 위의 글자, 테두리.
// `todoBlockColors`가 그 셋을 이 값에서 **도출**하면서 각각 대비를 맞춘다(§7 상태는 도출).
// 그래서 파스텔을 골라도 "연한 면 + 진한 글자"로 읽힌다.

export type PaletteEntry = { hex: string; label: string }

/** 12색조 × (진한 · 파스텔).
 *
 *  진한 쪽은 예전 분류 팔레트의 값을 그대로 쓴다 — 이미 쓰고 있는 분류의 색이 바뀌면 안 된다. */
export const WEAVE_PALETTE: readonly PaletteEntry[] = [
  { hex: '#e2638a', label: '핑크' },
  { hex: '#f5c2d0', label: '연핑크' },
  { hex: '#c86b6b', label: '코럴' },
  { hex: '#f2c4c0', label: '연코럴' },
  { hex: '#e0713f', label: '오렌지' },
  { hex: '#f7cdb4', label: '연오렌지' },
  { hex: '#e0a33a', label: '옐로' },
  { hex: '#f5ddab', label: '연옐로' },
  { hex: '#a8b03a', label: '라임' },
  { hex: '#dde0ab', label: '연라임' },
  { hex: '#4fb58a', label: '민트' },
  { hex: '#b8e5d1', label: '연민트' },
  { hex: '#3fae9e', label: '틸' },
  { hex: '#b2e2db', label: '연틸' },
  { hex: '#4f9fc8', label: '스카이' },
  { hex: '#b6dcee', label: '연스카이' },
  { hex: '#6e8ac8', label: '블루' },
  { hex: '#c2cfea', label: '연블루' },
  { hex: '#8b6ec8', label: '라벤더' },
  { hex: '#d2c6ee', label: '연라벤더' },
  { hex: '#b06ec0', label: '퍼플' },
  { hex: '#e2c6e9', label: '연퍼플' },
  { hex: '#9c7a5e', label: '브라운' },
  { hex: '#ddc9b8', label: '연브라운' },
]

/** 예전 **프로필** 팔레트. 견본 줄에서는 빠졌지만 **유효한 값으로 남는다.**
 *
 *  안 남기면 이 색을 쓰던 사람의 프로필이 다음에 열 때 조용히 역할 기본색으로
 *  되돌아간다 — 사용자가 고른 적 없는 색으로 바뀌는 셈이다.
 *
 *  이름까지 들고 있는 이유: 색 고르개는 지금 값이 목록에 없으면 **그 값을 한 칸 덧붙여**
 *  보여준다. 이름이 없으면 그 칸이 스크린리더에 아무것도 안 읽힌다(§8). */
export const LEGACY_PROFILE_SWATCHES: readonly PaletteEntry[] = [
  { hex: '#6e5aa8', label: '라벤더' },
  { hex: '#b85a78', label: '핑크' },
  { hex: '#3e8e70', label: '민트' },
  { hex: '#b0852a', label: '옐로' },
  { hex: '#4a7fb5', label: '블루' },
  { hex: '#c2673e', label: '오렌지' },
  { hex: '#3f8f8f', label: '틸' },
  { hex: '#9c5aa8', label: '퍼플' },
  { hex: '#b5544f', label: '코럴' },
  { hex: '#6d7f3a', label: '올리브' },
]

export const LEGACY_PROFILE_HEXES: readonly string[] = LEGACY_PROFILE_SWATCHES.map((e) => e.hex)

/** 팔레트(또는 예전 팔레트)에 있는 값인가. 대소문자는 무시한다. */
export function isPaletteColor(hex: string | null | undefined): boolean {
  if (!hex) return false
  const v = hex.toLowerCase()
  return WEAVE_PALETTE.some((e) => e.hex === v) || LEGACY_PROFILE_HEXES.includes(v)
}
