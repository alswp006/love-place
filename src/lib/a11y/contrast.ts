// WCAG 2.1 상대휘도·대비비(순수).
//
// 색은 `#rrggbb` 또는 `oklch(L% C H)`를 받는다 — 토큰을 OKLCH로 옮기면서 게이트가 소스를
// 그대로 읽어야 하기 때문이다. hex만 알던 시절엔 토큰이 oklch가 되는 순간 대비 게이트가
// 조용히 통과해버렸다(파싱 실패 = 검증 안 함).

export type Rgb = { r: number; g: number; b: number } // 0~1

function srgbFromLinear(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055
}

/** OKLCH → 선형 sRGB(클램프 전). 색역 밖이면 채널이 0~1을 벗어난다. */
function oklchToLinear(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const L = l_ ** 3
  const M = m_ ** 3
  const S = s_ ** 3
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
}

const OKLCH = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/i
// 3자리 축약(#fff)도 받는다 — CSS 소스를 그대로 훑는 게이트가 이 표기를 가장 많이 만난다.
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** 색 문자열 → sRGB 0~1. 못 읽으면 던진다(조용히 통과하는 게이트를 만들지 않는다). */
export function parseColor(input: string): Rgb {
  const s = input.trim()
  const hex = HEX.exec(s)
  if (hex) {
    const raw = hex[1]!
    const h =
      raw.length === 3
        ? raw
            .split('')
            .map((c) => c + c)
            .join('')
        : raw
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
    }
  }
  const ok = OKLCH.exec(s)
  if (ok) {
    const [lr, lg, lb] = oklchToLinear(Number(ok[1]) / 100, Number(ok[2]), Number(ok[3]))
    const clamp = (v: number) => Math.min(1, Math.max(0, srgbFromLinear(v)))
    return { r: clamp(lr), g: clamp(lg), b: clamp(lb) }
  }
  throw new Error(`읽을 수 없는 색: ${input}`)
}

/**
 * 이 OKLCH 색이 sRGB 색역 안인가.
 * 밖이면 브라우저가 잘라내므로 의도한 색·대비가 안 나온다(채도 0.15 위에서 흔히 발생).
 */
export function inSrgbGamut(input: string): boolean {
  const ok = OKLCH.exec(input.trim())
  if (!ok) return true // hex는 정의상 색역 안
  const ch = oklchToLinear(Number(ok[1]) / 100, Number(ok[2]), Number(ok[3]))
  return ch.every((v) => v >= -0.001 && v <= 1.001)
}

function channel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(color: string): number {
  const { r, g, b } = parseColor(color)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// 본문 4.5:1, 큰 글씨(≥24px 또는 ≥18.66px+600)·UI 3:1.
export function meetsAA(ratio: number, opts: { large: boolean }): boolean {
  return ratio >= (opts.large ? 3 : 4.5)
}
