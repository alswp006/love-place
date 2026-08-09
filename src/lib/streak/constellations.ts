// 황도 12궁 — 달마다 하나씩, 1:1로 딱 떨어진다.
//
// 왜 이걸 쓰나: 열두 달에 열두 별자리가 정확히 대응해서 한 해를 채우면 황도 한 바퀴가 완성된다.
// 앞서 쓰던 '그 달 밤에 보이는 별자리'는 12개월에 1:1로 안 떨어져 계절 안에서 돌려 써야 했고,
// 그러면 열두 칸에 같은 모양이 겹쳤다.
//
// ⚠️ 정직하게: 황도 12궁의 '그 달 별자리'는 **태양이 지나가는** 자리다. 즉 8월의 사자자리는
// 그 달 밤하늘에는 오히려 안 보인다(반년 뒤에 보인다). 그래서 이 앱은 "지금 하늘에 떠 있다"고
// 말하지 않고 "그 달을 상징하는 별자리"라고만 한다. hint도 별자리 기간과 모양만 말한다.
//
// 좌표는 100×68 박스 안의 근사치다(정밀 성도가 아니라 알아볼 수 있는 모양이 목적).
// edges는 이어지는 선 — 별자리마다 다르므로 순서대로 잇는 폴리라인으로 뭉뚱그리지 않는다.

export type ConstellationDef = {
  key: string
  /** 우리말 이름 — 화면에 그대로 나온다. */
  name: string
  /** 한 줄 설명: 별자리 기간 + 모양. 하늘에 보인다고 주장하지 않는다. */
  hint: string
  points: readonly (readonly [number, number])[]
  edges: readonly (readonly [number, number])[]
}

export const CONSTELLATIONS: readonly ConstellationDef[] = [
  {
    key: 'capricorn',
    name: '염소자리',
    hint: '12.22 ~ 1.19 · 바다염소의 삼각 꼬리',
    points: [[14, 18], [30, 12], [50, 20], [68, 32], [84, 46], [58, 52], [30, 38]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]],
  },
  {
    key: 'aquarius',
    name: '물병자리',
    hint: '1.20 ~ 2.18 · 흘러내리는 물줄기',
    points: [[16, 16], [34, 22], [52, 16], [66, 28], [52, 38], [66, 48], [84, 54]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  {
    key: 'pisces',
    name: '물고기자리',
    hint: '2.19 ~ 3.20 · 끈으로 이어진 두 마리',
    points: [[12, 14], [28, 26], [46, 34], [64, 42], [80, 50], [90, 36], [80, 22]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  {
    key: 'aries',
    name: '양자리',
    hint: '3.21 ~ 4.19 · 굽은 뿔, 별 넷',
    points: [[18, 46], [42, 30], [66, 22], [86, 18]],
    edges: [[0, 1], [1, 2], [2, 3]],
  },
  {
    key: 'taurus',
    name: '황소자리',
    hint: '4.20 ~ 5.20 · V자 얼굴과 두 뿔',
    points: [[48, 44], [34, 34], [22, 24], [12, 14], [62, 34], [76, 24], [88, 12]],
    edges: [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6]],
  },
  {
    key: 'gemini',
    name: '쌍둥이자리',
    hint: '5.21 ~ 6.21 · 나란히 선 두 사람',
    points: [[28, 12], [50, 14], [22, 34], [28, 54], [54, 36], [62, 54]],
    edges: [[0, 1], [0, 2], [2, 3], [1, 4], [4, 5]],
  },
  {
    key: 'cancer',
    name: '게자리',
    hint: '6.22 ~ 7.22 · 뒤집힌 Y자 집게',
    points: [[52, 12], [48, 32], [30, 46], [70, 44], [82, 58]],
    edges: [[0, 1], [1, 2], [1, 3], [3, 4]],
  },
  {
    key: 'leo',
    name: '사자자리',
    hint: '7.23 ~ 8.22 · 낫 모양 갈기',
    points: [[22, 44], [26, 30], [22, 18], [62, 20], [58, 40], [84, 28]],
    edges: [[0, 1], [1, 2], [0, 4], [4, 5], [5, 3], [3, 1]],
  },
  {
    key: 'virgo',
    name: '처녀자리',
    hint: '8.23 ~ 9.22 · 넓게 뻗은 Y자',
    points: [[16, 16], [34, 26], [52, 18], [46, 38], [64, 46], [80, 34], [72, 60]],
    edges: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [4, 6]],
  },
  {
    key: 'libra',
    name: '천칭자리',
    hint: '9.23 ~ 10.22 · 접시 둘을 단 저울',
    points: [[28, 22], [58, 14], [74, 32], [44, 40], [22, 52], [78, 54]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [2, 5]],
  },
  {
    key: 'scorpius',
    name: '전갈자리',
    hint: '10.23 ~ 11.22 · 휘어진 꼬리',
    points: [[16, 18], [26, 13], [32, 22], [40, 30], [48, 40], [58, 48], [70, 52], [80, 44]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
  },
  {
    key: 'sagittarius',
    name: '사수자리',
    hint: '11.23 ~ 12.21 · 찻주전자 모양',
    points: [[22, 48], [22, 28], [44, 22], [64, 28], [66, 48], [42, 52], [46, 10], [86, 36]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [2, 6], [3, 7]],
  },
] as const

/**
 * 달 → 그 달을 상징하는 황도 별자리(1:1).
 * 관례대로 그 달의 앞부분을 차지하는 궁을 그 달의 것으로 본다(1월=염소, 8월=사자…).
 */
const ZODIAC_BY_MONTH: Record<number, string> = {
  1: 'capricorn',
  2: 'aquarius',
  3: 'pisces',
  4: 'aries',
  5: 'taurus',
  6: 'gemini',
  7: 'cancer',
  8: 'leo',
  9: 'virgo',
  10: 'libra',
  11: 'scorpius',
  12: 'sagittarius',
}

const byKey = new Map(CONSTELLATIONS.map((c) => [c.key, c]))

/**
 * 그 달의 별자리 — 달만 보면 정해진다(해가 바뀌어도 8월은 늘 사자자리).
 * 저장하지 않는다: 같은 달은 언제 열어도 같은 별자리다.
 */
export function constellationOfMonth(monthKey: string): ConstellationDef {
  const month = Number(monthKey.slice(5)) || 1
  return byKey.get(ZODIAC_BY_MONTH[month] ?? 'capricorn')!
}

export type Slot = { x: number; y: number; anchor: boolean }

/**
 * 별자리를 count개의 자리로 편다.
 *
 * 실제 별자리의 밝은 별은 4~8개인데 한 달치 별은 56~62개다. 그래서 밝은 별(anchor)을 먼저 두고,
 * 나머지는 별자리를 잇는 선 위에 고르게 흩뿌린다. 초반엔 모양의 뼈대가 먼저 서고,
 * 채울수록 선이 별로 촘촘해져 마지막엔 빛나는 선 그림이 된다.
 *
 * 순서는 '모든 변에 한 점씩'을 한 바퀴로 돌린다 — 한 변만 먼저 채우면 한쪽으로 쏠려 보인다.
 */
export function starSlots(def: ConstellationDef, count: number): Slot[] {
  const anchors: Slot[] = def.points.map(([x, y]) => ({ x, y, anchor: true }))
  if (count <= anchors.length) return anchors.slice(0, count)

  const remaining = count - anchors.length

  // 변 길이에 비례해 나눈다. 같은 개수씩 나누면 짧은 변에 별이 몰려 밝은 별을 덮는다.
  const lens = def.edges.map(([a, b]) => {
    const p = def.points[a]!
    const q = def.points[b]!
    return Math.hypot(q[0] - p[0], q[1] - p[1])
  })
  const total = lens.reduce((s2, v) => s2 + v, 0)
  const quota = lens.map((l) => (l / total) * remaining)
  const counts = quota.map(Math.floor)
  // 내림하고 남은 자리는 소수부가 큰 변부터(최대잉여법) — 합이 정확히 remaining이 되게.
  let left = remaining - counts.reduce((s2, v) => s2 + v, 0)
  const order = quota
    .map((q, i) => ({ i, frac: q - Math.floor(q) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (left <= 0) break
    counts[i] = (counts[i] ?? 0) + 1
    left--
  }

  // 각 변 안에서 균등 간격. 양 끝(밝은 별)에는 붙지 않는다.
  const perEdge: Slot[][] = def.edges.map(([a, b], e) => {
    const n = counts[e] ?? 0
    const p = def.points[a]!
    const q = def.points[b]!
    return Array.from({ length: n }, (_, k) => {
      const t = (k + 1) / (n + 1)
      return { x: p[0] + (q[0] - p[0]) * t, y: p[1] + (q[1] - p[1]) * t, anchor: false }
    })
  })

  // 채워지는 순서: 각 변의 가운데부터 바깥으로. 한쪽 끝부터 채우면 초반에 한 귀퉁이만 자란다.
  const spread = (n: number): number[] => {
    const out: number[] = []
    const rec = (lo: number, hi: number) => {
      if (lo > hi) return
      const mid = (lo + hi) >> 1
      out.push(mid)
      rec(lo, mid - 1)
      rec(mid + 1, hi)
    }
    rec(0, n - 1)
    return out
  }
  const seq = perEdge.map((slots) => spread(slots.length).map((i) => slots[i]!))

  // 변끼리도 번갈아 — 한 변만 먼저 다 채우면 한쪽으로 쏠려 보인다.
  const fills: Slot[] = []
  for (let round = 0; fills.length < remaining; round++) {
    let pushed = false
    for (const list of seq) {
      const s2 = list[round]
      if (!s2) continue
      fills.push(s2)
      pushed = true
      if (fills.length >= remaining) break
    }
    if (!pushed) break
  }

  return [...anchors, ...fills]
}

/** 그 달의 날 수. 채워야 할 별은 이 값 × 사람 수(하루에 한 사람이 하나)다. */
export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate()
}

/**
 * 한 달을 다 채우는 데 필요한 별 수 = 날 수 × 사람 수.
 *
 * 혼자 쓰는 동안 2로 고정하면 **한 달을 다 채워도 절반**이라 별자리가 영원히 완성되지 않는다.
 * 목표가 달성 불가면 그건 게이미피케이션이 아니라 그냥 실패 표시다(0024 솔로 모드).
 * 연결하면 분모가 2로 늘어난다 — 같이 하니 더 채워야 하는 게 자연스럽다.
 */
export function starsNeededForMonth(monthKey: string, members: 1 | 2 = 2): number {
  return daysInMonth(monthKey) * members
}
