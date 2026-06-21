// WCAG 2.1 상대휘도·대비비(순수). 색은 #rrggbb 가정.
function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
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
