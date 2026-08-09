#!/usr/bin/env node
// 남한 외곽선을 공유 카드용 좌표 배열로 굽는다 → src/lib/recap/koreaOutline.ts
//
// 왜 지도 SDK를 안 쓰나: 공유 카드는 canvas로 그려 기기 안에서 PNG가 된다(서버·공개 링크 없음).
// 네이버 타일을 캔버스에 굽는 건 이용약관·CORS 문제이고, 무엇보다 **스크린샷처럼 보인다.**
// 우리가 원하는 건 우리 색으로 그린 실루엣이다 — 그래야 카드가 디자인된 물건으로 읽힌다.
//
// 출처: Natural Earth (public domain) — world-atlas가 TopoJSON으로 재배포한 것.
// 재실행: node scripts/build-korea-outline.mjs [--src <url>] [--tolerance 0.01]
// 결과는 생성물이므로 커밋한다(빌드가 네트워크에 의존하지 않게).

import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const SRC = opt('src', 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json')
const TOLERANCE = Number(opt('tolerance', '0.012')) // 도(degree). 클수록 거칠고 작아진다.
const MIN_RING_POINTS = 8 // 이보다 작은 섬은 카드에서 점 하나로 보인다 — 뺀다.

const topo = await (await fetch(SRC)).json()
const objectKey = Object.keys(topo.objects)[0]
const geo = topo.objects[objectKey].geometries.find((g) => g.properties?.name === 'South Korea')
if (!geo) throw new Error('South Korea를 찾지 못했습니다.')

// ── TopoJSON 아크 디코딩(델타 → 절대 좌표) ──
const { scale, translate } = topo.transform
function decodeArc(index) {
  const reversed = index < 0
  const arc = topo.arcs[reversed ? ~index : index]
  let x = 0
  let y = 0
  const out = arc.map(([dx, dy]) => {
    x += dx
    y += dy
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]]
  })
  return reversed ? out.reverse() : out
}

/** 폴리곤 링(아크 인덱스 배열) → 좌표 배열. 아크 사이 중복 점 제거. */
function ringToPoints(ring) {
  const pts = []
  for (const idx of ring) {
    const arc = decodeArc(idx)
    for (const p of arc) {
      const last = pts[pts.length - 1]
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p)
    }
  }
  return pts
}

// MultiPolygon → 바깥 링만(구멍은 카드에서 의미 없다)
const polygons = geo.type === 'MultiPolygon' ? geo.arcs : [geo.arcs]
let rings = polygons.map((poly) => ringToPoints(poly[0]))

// ── Douglas-Peucker 단순화 ──
function perpDist(p, a, b) {
  const [x, y] = p
  const [x1, y1] = a
  const [x2, y2] = b
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1)
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}
function simplify(points, tol) {
  if (points.length < 3) return points
  let maxD = 0
  let idx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1])
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD <= tol) return [points[0], points[points.length - 1]]
  return [
    ...simplify(points.slice(0, idx + 1), tol).slice(0, -1),
    ...simplify(points.slice(idx), tol),
  ]
}

/** 대략적인 링 넓이(신발끈) — 큰 섬만 남기려고 쓴다. */
const ringArea = (pts) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a / 2)
}

rings = rings
  .map((r) => simplify(r, TOLERANCE))
  .filter((r) => r.length >= MIN_RING_POINTS)
  .sort((a, b) => ringArea(b) - ringArea(a))
  .slice(0, 6) // 본토 + 제주 + 큰 섬 몇 개. 나머지는 카드에서 먼지다.

const round = (n) => Math.round(n * 1000) / 1000 // 소수 셋째(약 100m) — 카드 해상도엔 차고 넘친다
const body = rings
  .map((r) => `  [${r.map(([x, y]) => `[${round(x)},${round(y)}]`).join(',')}],`)
  .join('\n')

const total = rings.reduce((n, r) => n + r.length, 0)
const out = `// 생성물 — scripts/build-korea-outline.mjs 가 만든다. 손으로 고치지 말 것.
// 출처: Natural Earth (public domain), world-atlas TopoJSON 재배포본.
// 링 ${rings.length}개 · 점 ${total}개 · 단순화 tolerance ${TOLERANCE}도.
//
// 공유 카드의 전국 지도 배경. 지도 SDK 타일을 쓰지 않는 이유는 생성 스크립트 주석 참조 —
// 요약하면 캔버스 PNG로 굽어야 하고, 타일을 쓰면 스크린샷처럼 보이기 때문이다.

/** [경도, 위도] 링들. 첫 번째가 본토. */
export const KOREA_RINGS: readonly (readonly (readonly [number, number])[])[] = [
${body}
]

/** 카드 투영에 쓰는 대략 경계(남한). 여행 좌표가 이 밖이면 지도 밖 여행이다. */
export const KOREA_BOUNDS = { minLng: 125.8, maxLng: 129.7, minLat: 33.0, maxLat: 38.7 }
`

writeFileSync('src/lib/recap/koreaOutline.ts', out)
console.log(`링 ${rings.length}개 · 점 ${total}개 · ${(out.length / 1024).toFixed(1)}KB`)
