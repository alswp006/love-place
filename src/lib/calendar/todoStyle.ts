// 할 일 블록의 색 한 벌 — 완료는 **채움**, 미완료는 **테두리**.
//
// ⚠️ Flutter판 `app/lib/calendar/todo_style.dart`의 이식. 같은 분류 색이 두 앱에서 같은
//    블록으로 보여야 하므로 한쪽만 고치지 말 것.
//
// ## 왜 함수인가 (토큰을 더하지 않는 이유)
//
// 채움 색은 사용자가 고른 분류 색이다. 그 위에 얹을 글자색은 **미리 정해 둘 수 없다**:
// 흰 글자는 진한 분류 색 절반에서 대비가 모자라고, 잉크색도 파스텔 아닌 곳에서 모자란다.
// 색은 저장이 아니라 도출이라는 규칙(§7)이 여기에도 그대로 적용된다.
//
// ## 세 갈래로 이중화한다 (§8)
//
// 채움만으로 완료를 말하면 색을 못 가르는 눈에는 아무 말도 아니다. 그래서 호출부는
// **셋을 함께** 쓴다: ① 형태(빈 테두리 ↔ 꽉 찬 면) ② 체크 글리프 ③ 글자 굵기.
// 이 파일은 그중 색만 책임진다.
//
// ## 완료가 흐려지지 않는다
//
// 끝낸 일을 흐리게 + 취소선으로 누르면 "눈에 잘 안 들어온다". 완료는 **더 또렷해진다**.

export type TodoBlockColors = { fill: string; onFill: string; outline: string }

/** 본문 대비 기준(WCAG AA). 블록 글자는 10px대 소형이라 3:1이 아니라 4.5:1을 쓴다. */
const ON_FILL_TARGET = 4.5

/** 테두리는 글자가 아니라 **경계선**이라 비텍스트 기준(3:1)을 쓴다.
 *  3.0이 아니라 3.2인 이유: '오늘' 칸은 배경이 옅게 물들어 실제 대비가 0.3~0.4쯤 내려간다. */
const OUTLINE_TARGET = 3.2

/** 한 걸음에 섞는 비율. 잘게 갈수록 원래 색에 가깝게 멈춘다. */
const STEP = 0.06
const MAX_STEPS = 24

type RGB = { r: number; g: number; b: number }

/** '#rrggbb' → 0~255. 못 읽으면 null — 깨진 값 하나가 달력을 죽이지 않는다. */
export function parseHex(hex: string | null | undefined): RGB | null {
  if (!hex) return null
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function toHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** WCAG 상대 휘도. */
function luminance({ r, g, b }: RGB): number {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

function lerp(from: RGB, toward: RGB, t: number): RGB {
  return {
    r: from.r + (toward.r - from.r) * t,
    g: from.g + (toward.g - from.g) * t,
    b: from.b + (toward.b - from.b) * t,
  }
}

/** from을 toward 쪽으로 조금씩 섞어 against와의 대비가 target을 넘게 만든다.
 *
 *  못 넘기면 마지막 값을 돌려준다 — 여기서 던지면 사용자가 고른 색 하나 때문에 화면이
 *  죽는다. 대비가 모자란 채로라도 그리는 편이 낫고, 그 사실은 테스트가 잡는다. */
function toneUntil(from: RGB, toward: RGB, against: RGB, target: number): RGB {
  let c = from
  for (let i = 0; i < MAX_STEPS; i++) {
    if (contrast(c, against) >= target) return c
    c = lerp(c, toward, STEP)
  }
  return c
}

/** 라이트/다크에서 면·잉크·배경이 무엇인가. tokens.css의 값과 **같은 뜻**이어야 한다. */
export type Surfaces = { surface: RGB; ink: RGB; bg: RGB }

export const LIGHT_SURFACES: Surfaces = {
  surface: { r: 255, g: 255, b: 255 },
  ink: { r: 72, g: 58, b: 68 }, // --ink oklch(28% 0.02 340) 근사
  bg: { r: 251, g: 248, b: 249 }, // --bg 근사
}

export const DARK_SURFACES: Surfaces = {
  surface: { r: 38, g: 33, b: 37 },
  ink: { r: 240, g: 234, b: 238 },
  bg: { r: 26, g: 22, b: 26 },
}

/** 분류 색(base, 없으면 '분류 없음') → 블록 색 한 벌. */
export function todoBlockColors(
  base: string | null | undefined,
  surfaces: Surfaces = LIGHT_SURFACES,
): TodoBlockColors {
  // 분류가 없는 할 일은 브랜드 핑크를 쓰지 않는다 — 그 색은 '상대 트랙'과 같아서
  // 분류 없음이 상대 일정으로 읽힌다.
  const seed = parseHex(base) ?? { r: 122, g: 110, b: 118 }

  // 채운 면 위의 글자는 **둘 중 더 잘 보이는 쪽**을 고른다. 고정하면 밝은 분류색에서
  // 흰 글자가, 어두운 분류색에서 잉크 글자가 각각 묻힌다.
  const onFill =
    contrast(surfaces.surface, seed) >= contrast(surfaces.ink, seed) ? surfaces.surface : surfaces.ink

  // 글자색을 정했으면 이제 **면을 움직여** 대비를 맞춘다. 글자를 움직이면 분류 색이
  // 흐려지는 게 아니라 글자가 애매해져서, 어느 분류인지 알아보기 더 어려워진다.
  const fill = toneUntil(seed, onFill === surfaces.surface ? surfaces.ink : surfaces.surface, onFill, ON_FILL_TARGET)

  // 테두리는 배경 위에 홀로 서므로 배경과 겨룬다.
  const outline = toneUntil(seed, surfaces.ink, surfaces.bg, OUTLINE_TARGET)

  return { fill: toHex(fill), onFill: toHex(onFill), outline: toHex(outline) }
}
