import { describe, it, expect } from 'vitest'
import { buildYearMap, projectKorea, type YearStop } from '@/lib/recap/yearMap'
import { KOREA_BOUNDS, KOREA_RINGS } from '@/lib/recap/koreaOutline'

// 전국 지도는 "1년치가 쌓인 증거"다. 두 가지가 거짓이 되면 안 된다:
//   ① 같은 곳을 여러 번 갔다고 지도가 더 채워지면 안 된다(안 다닌 척도, 더 다닌 척도 금지).
//   ② 축척은 **한국 전체 고정**이어야 한다. 방문지에 맞춰 확대하면 한 곳을 갔든 스무 곳을
//      갔든 같은 그림이 나와서 '얼마나 다녔는지'가 사라진다.

const stop = (over: Partial<YearStop> = {}): YearStop => ({
  placeId: 'p1',
  lat: 37.5665,
  lng: 126.978,
  date: '2026-03-01',
  regionLabel: '서울',
  ...over,
})

describe('buildYearMap', () => {
  it('같은 장소를 여러 번 가도 점은 하나 — 중복 방문이 지도를 더 채우면 거짓말이다', () => {
    const m = buildYearMap([
      stop({ date: '2026-01-01' }),
      stop({ date: '2026-02-01' }),
      stop({ date: '2026-03-01' }),
    ])
    expect(m.dots).toHaveLength(1)
    expect(m.stopCount).toBe(1)
  })

  it('지역 수는 region_label 기준 — 한 지역의 여러 곳이 여러 지역이 되지 않는다', () => {
    const m = buildYearMap([
      stop({ placeId: 'a', regionLabel: '서울' }),
      stop({ placeId: 'b', lat: 37.55, regionLabel: '서울' }),
      stop({ placeId: 'c', lat: 38.207, lng: 128.59, regionLabel: '속초' }),
    ])
    expect(m.regionCount).toBe(2)
    expect(m.stopCount).toBe(3)
  })

  it('실은 날짜순으로 이어진다', () => {
    const m = buildYearMap([
      stop({ placeId: 'c', lat: 35.16, lng: 129.16, date: '2026-09-01' }),
      stop({ placeId: 'a', lat: 37.57, lng: 126.98, date: '2026-01-01' }),
      stop({ placeId: 'b', lat: 38.21, lng: 128.59, date: '2026-05-01' }),
    ])
    expect(m.thread.map((p) => Math.round(p.lat))).toEqual([38, 38, 35])
  })

  it('날짜 없는 방문은 실에서 빠지되 점으로는 남는다 — 갔던 건 사실이다', () => {
    const m = buildYearMap([
      stop({ placeId: 'a', date: '2026-01-01' }),
      stop({ placeId: 'b', lat: 35.16, lng: 129.16, date: null }),
    ])
    expect(m.dots).toHaveLength(2)
    expect(m.thread).toHaveLength(1)
  })

  it('연달아 같은 좌표면 실이 제자리에 머물지 않게 접는다', () => {
    const m = buildYearMap([
      stop({ placeId: 'a', date: '2026-01-01' }),
      stop({ placeId: 'b', date: '2026-01-02' }), // 같은 좌표, 다른 장소
      stop({ placeId: 'c', lat: 35.16, lng: 129.16, date: '2026-01-03' }),
    ])
    expect(m.thread).toHaveLength(2)
  })

  it('한국 밖 좌표는 버린다 — 해외 여행이 지도 밖으로 선을 끌지 않게', () => {
    const m = buildYearMap([
      stop({ placeId: 'kr' }),
      stop({ placeId: 'jp', lat: 35.68, lng: 139.69, regionLabel: '도쿄' }), // 도쿄
      stop({ placeId: 'nan', lat: Number.NaN, lng: 127 }),
    ])
    expect(m.stopCount).toBe(1)
    expect(m.regionCount).toBe(1)
  })

  it('빈 입력도 안전하다(첫 사용자 화면)', () => {
    expect(buildYearMap([])).toEqual({ traces: [], thread: [], dots: [], regionCount: 0, stopCount: 0 })
  })
})

describe('projectKorea — 축척은 한국 전체로 고정', () => {
  const box = { x: 0, y: 0, w: 900, h: 1080 }

  it('서울만 다닌 해에도 서울은 지도 위쪽 한 점이다(꽉 차게 잡지 않는다)', () => {
    const seoul = projectKorea({ lat: 37.5665, lng: 126.978 }, box)
    const busan = projectKorea({ lat: 35.1587, lng: 129.16 }, box)
    // 서울이 부산보다 위(y가 작다)이고, 오른쪽이 아니다.
    expect(seoul.y).toBeLessThan(busan.y)
    expect(seoul.x).toBeLessThan(busan.x)
  })

  it('경계 좌표가 상자 안에 들어온다', () => {
    for (const p of [
      { lat: KOREA_BOUNDS.minLat, lng: KOREA_BOUNDS.minLng },
      { lat: KOREA_BOUNDS.maxLat, lng: KOREA_BOUNDS.maxLng },
    ]) {
      const q = projectKorea(p, box)
      expect(q.x).toBeGreaterThanOrEqual(box.x - 1)
      expect(q.x).toBeLessThanOrEqual(box.x + box.w + 1)
      expect(q.y).toBeGreaterThanOrEqual(box.y - 1)
      expect(q.y).toBeLessThanOrEqual(box.y + box.h + 1)
    }
  })

  it('비율을 유지한다 — 늘리면 한국이 아니게 된다', () => {
    // 같은 위도에서 동→서 이동과, 같은 경도에서 남→북 이동의 화면 거리 비가
    // 실제 거리 비와 맞아야 한다(경도는 cos 보정을 받는다).
    const a = projectKorea({ lat: 36, lng: 127 }, box)
    const b = projectKorea({ lat: 36, lng: 128 }, box)
    const c = projectKorea({ lat: 37, lng: 127 }, box)
    const perLng = Math.abs(b.x - a.x)
    const perLat = Math.abs(c.y - a.y)
    const cos = Math.cos((((KOREA_BOUNDS.minLat + KOREA_BOUNDS.maxLat) / 2) * Math.PI) / 180)
    expect(perLng / perLat).toBeCloseTo(cos, 2)
  })
})

describe('koreaOutline — 생성물이 실제로 한국이다', () => {
  it('본토를 포함해 링이 여러 개고, 좌표가 남한 범위 안이다', () => {
    expect(KOREA_RINGS.length).toBeGreaterThanOrEqual(2) // 본토 + 제주 이상
    const all = KOREA_RINGS.flat()
    expect(all.length).toBeGreaterThan(100)
    for (const [lng, lat] of all) {
      expect(lng).toBeGreaterThan(125)
      expect(lng).toBeLessThan(131)
      expect(lat).toBeGreaterThan(32.5)
      expect(lat).toBeLessThan(39)
    }
  })

  it('첫 링이 가장 큰 본토다(제주가 본토보다 앞에 오면 그리기 순서가 뒤집힌다)', () => {
    const span = (r: readonly (readonly [number, number])[]) => {
      const lats = r.map(([, y]) => y)
      return Math.max(...lats) - Math.min(...lats)
    }
    expect(span(KOREA_RINGS[0]!)).toBeGreaterThan(span(KOREA_RINGS[1]!))
  })
})

describe('buildYearMap — 실측 궤적이 주인공', () => {
  const trace = [
    { lat: 37.5, lng: 127.0 },
    { lat: 37.8, lng: 127.5 },
    { lat: 38.2, lng: 128.59 },
  ]

  it('궤적을 그대로 담는다 — 차로 간 200km도 전국 축척에서 보인다', () => {
    const m = buildYearMap([stop()], [trace])
    expect(m.traces).toHaveLength(1)
    expect(m.traces[0]).toHaveLength(3)
  })

  it('점 하나짜리 궤적은 선이 못 되므로 뺀다', () => {
    const m = buildYearMap([stop()], [[{ lat: 37, lng: 127 }], trace])
    expect(m.traces).toHaveLength(1)
  })

  it('궤적을 줘도 방문 점·지역 수는 그대로 — 두 층이 서로를 지우지 않는다', () => {
    const m = buildYearMap([stop({ placeId: 'a' }), stop({ placeId: 'b', lat: 35.1, lng: 129 })], [trace])
    expect(m.dots).toHaveLength(2)
    expect(m.traces).toHaveLength(1)
  })

  it('궤적 배열을 복사한다 — 호출부가 나중에 건드려도 지도가 안 바뀐다', () => {
    const src = [{ lat: 37, lng: 127 }, { lat: 38, lng: 128 }]
    const m = buildYearMap([], [src])
    src.push({ lat: 39, lng: 129 })
    expect(m.traces[0]).toHaveLength(2)
  })
})
