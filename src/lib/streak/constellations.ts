// 실제 별자리 목록 — 우리가 지어낸 모양이 아니라 하늘에 있는 것들.
//
// 왜 실제 별자리인가: 앞선 '돛단배·리본' 같은 이름은 주 키 해시로 뽑은 거라 그 주와 아무
// 상관이 없었다(여정 길을 버린 것과 같은 문제). 실제 별자리는 이름도 모양도 임의가 아니고,
// **그 계절에 실제로 보이는 것**을 배정하므로 "지금 하늘에 있는 걸 채운다"는 말이 참이 된다.
//
// 좌표는 100×68 박스 안의 근사치다(정밀 성도가 아니라 알아볼 수 있는 모양이 목적).
// edges는 이어지는 선 — 별자리마다 다르므로 순서대로 잇는 폴리라인으로 뭉뚱그리지 않는다
// (북두칠성 바가지는 닫히고 손잡이는 안 닫힌다).

export type ConstellationDef = {
  key: string
  /** 우리말 이름 — 화면에 그대로 나온다. */
  name: string
  /** 한 줄 설명(무엇을 보고 있는지). */
  hint: string
  points: readonly (readonly [number, number])[]
  edges: readonly (readonly [number, number])[]
}

export const CONSTELLATIONS: readonly ConstellationDef[] = [
  {
    key: 'bigdipper',
    name: '북두칠성',
    hint: '큰곰자리의 국자 — 북쪽 하늘',
    points: [
      [34, 18], [30, 34], [48, 40], [50, 24], [64, 20], [76, 24], [88, 32],
    ],
    // 바가지(0-1-2-3-0)는 닫고, 손잡이(3-4-5-6)는 이어만 둔다.
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
  },
  {
    key: 'leo',
    name: '사자자리',
    hint: '봄철 남쪽 하늘의 사자',
    points: [
      [22, 44], [26, 30], [22, 18], [62, 20], [58, 40], [84, 28],
    ],
    edges: [[0, 1], [1, 2], [0, 4], [4, 5], [5, 3], [3, 1]],
  },
  {
    key: 'cygnus',
    name: '백조자리',
    hint: '여름 은하수 위의 큰 십자',
    points: [
      [50, 10], [50, 32], [50, 56], [22, 28], [78, 28],
    ],
    edges: [[0, 1], [1, 2], [3, 1], [1, 4]],
  },
  {
    key: 'lyra',
    name: '거문고자리',
    hint: '여름 밤 가장 밝은 별 직녀성',
    points: [
      [20, 14], [36, 26], [32, 44], [50, 50], [54, 32],
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]],
  },
  {
    key: 'scorpius',
    name: '전갈자리',
    hint: '여름 남쪽 낮게 뜨는 갈고리',
    points: [
      [16, 18], [26, 13], [32, 22], [40, 30], [48, 40], [58, 48], [70, 52], [80, 44],
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
  },
  {
    key: 'cassiopeia',
    name: '카시오페이아',
    hint: '가을 북쪽 하늘의 W',
    points: [
      [16, 20], [32, 42], [50, 22], [68, 44], [86, 24],
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    key: 'pegasus',
    name: '페가수스 사각형',
    hint: '가을 하늘을 가르는 큰 네모',
    points: [
      [26, 16], [74, 16], [78, 52], [30, 52],
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
  },
  {
    key: 'orion',
    name: '오리온자리',
    hint: '겨울 하늘의 사냥꾼 — 가운데 세 별이 허리띠',
    points: [
      [28, 14], [64, 12], [40, 32], [50, 34], [60, 36], [68, 54], [28, 52],
    ],
    edges: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 6], [4, 5]],
  },
  {
    key: 'gemini',
    name: '쌍둥이자리',
    hint: '겨울 하늘에 나란히 선 두 사람',
    points: [
      [28, 12], [50, 14], [22, 34], [28, 54], [54, 36], [62, 54],
    ],
    edges: [[0, 1], [0, 2], [2, 3], [1, 4], [4, 5]],
  },
] as const

/**
 * 그 달에 실제로 보이는 별자리들(한국 저녁 하늘 기준, 대략).
 * 계절이 바뀌면 채우는 별자리도 바뀐다 — 그게 이 기능의 유일한 '의미'다.
 */
const BY_MONTH: Record<number, readonly string[]> = {
  1: ['orion', 'gemini'],
  2: ['orion', 'gemini'],
  3: ['bigdipper', 'leo'],
  4: ['bigdipper', 'leo'],
  5: ['bigdipper', 'leo'],
  6: ['cygnus', 'lyra', 'scorpius'],
  7: ['cygnus', 'lyra', 'scorpius'],
  8: ['cygnus', 'lyra', 'scorpius'],
  9: ['cassiopeia', 'pegasus'],
  10: ['cassiopeia', 'pegasus'],
  11: ['cassiopeia', 'pegasus'],
  12: ['orion', 'gemini'],
}

const byKey = new Map(CONSTELLATIONS.map((c) => [c.key, c]))

/**
 * 그 달에 채울 별자리 — 그 달에 실제로 보이는 것 중 하나.
 * 해가 바뀌면 같은 달이라도 다른 별자리가 나온다(여름을 세 해 보내면 백조·거문고·전갈을 다 채운다).
 * 저장하지 않는다: 같은 달은 언제 열어도 같은 별자리다.
 */
export function constellationOfMonth(monthKey: string): ConstellationDef {
  const [y, m] = monthKey.split('-').map(Number)
  const month = m ?? 1
  const pool = BY_MONTH[month] ?? BY_MONTH[1]!
  return byKey.get(pool[(y ?? 0) % pool.length]!)!
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

/** 그 달의 날 수 — 채워야 할 별은 이 값 × 2(둘이 하루에 하나씩)다. */
export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate()
}

/** 한 달을 다 채우는 데 필요한 별 수 = 날 수 × 2명. */
export function starsNeededForMonth(monthKey: string): number {
  return daysInMonth(monthKey) * 2
}
