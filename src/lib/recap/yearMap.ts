import { KOREA_BOUNDS } from './koreaOutline'
import type { LatLng } from './sharePath'

// 전국 지도 카드의 순수 계산 — "1년 동안 우리가 다닌 곳".
//
// 왜 실측 GPS 경로를 안 쓰나: 전국 축척에서 3km 산책은 **2픽셀**이다. 보이지도 않는다.
// 전국 지도에서 의미 있는 단위는 '어디에 갔는가'이고, 그건 방문한 장소다.
// 그래서 이 카드는 장소 점 + 시간순으로 이은 실 하나로 그린다 — 한 해의 이동 실타래.
//
// 곁가지 이득이 하나 있다: 장소는 사용자가 **목적지로 저장한 곳**이라(카페·식당·명소)
// 집 좌표가 애초에 들어오지 않는다. 여행별 카드처럼 양 끝을 잘라낼 필요가 없다.

export type YearStop = {
  placeId: string
  lat: number
  lng: number
  /** 방문일(YYYY-MM-DD). 없으면 순서를 정할 수 없어 실에서 빠지고 점으로만 남는다. */
  date: string | null
  regionLabel: string | null
}

export type YearMapData = {
  /** 시간순으로 이을 점들(날짜 있는 방문만). */
  thread: LatLng[]
  /** 지도에 찍을 모든 방문 장소(중복 제거). */
  dots: LatLng[]
  /** 다녀온 지역 수 — "전국 몇 곳"의 근거. region_label 기준. */
  regionCount: number
  stopCount: number
}

/**
 * 방문 기록 → 전국 지도 데이터(순수).
 *
 * 같은 장소를 여러 번 갔어도 점은 하나다(중복 방문이 지도를 더 채우면 거짓말이 된다).
 * 실은 날짜순이고, 같은 날 여러 곳이면 원래 순서를 유지한다(안정 정렬).
 */
export function buildYearMap(stops: readonly YearStop[]): YearMapData {
  const inKorea = stops.filter(
    (s) =>
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng) &&
      s.lat >= KOREA_BOUNDS.minLat &&
      s.lat <= KOREA_BOUNDS.maxLat &&
      s.lng >= KOREA_BOUNDS.minLng &&
      s.lng <= KOREA_BOUNDS.maxLng,
  )

  const seen = new Set<string>()
  const dots: LatLng[] = []
  const regions = new Set<string>()
  for (const s of inKorea) {
    if (!seen.has(s.placeId)) {
      seen.add(s.placeId)
      dots.push({ lat: s.lat, lng: s.lng })
    }
    if (s.regionLabel) regions.add(s.regionLabel)
  }

  const dated = inKorea
    .filter((s) => s.date)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.date! < b.s.date! ? -1 : a.s.date! > b.s.date! ? 1 : a.i - b.i))
    .map(({ s }) => ({ lat: s.lat, lng: s.lng }))

  // 같은 좌표가 연달아 오면 실이 제자리에 머문다 — 이어지는 중복만 접는다.
  const thread: LatLng[] = []
  for (const p of dated) {
    const last = thread[thread.length - 1]
    if (!last || last.lat !== p.lat || last.lng !== p.lng) thread.push(p)
  }

  return { thread, dots, regionCount: regions.size, stopCount: dots.length }
}

/**
 * 위경도 → 카드 좌표. **한국 전체 경계 고정**이다.
 *
 * 방문 지점에 맞춰 확대하지 않는 게 핵심이다: 서울만 다닌 해에도 전국 지도가 나와야
 * "아직 여기밖에 못 갔네"가 보이고, 그게 다음 여행의 동기가 된다. 매번 꽉 차게 잡으면
 * 한 곳을 갔든 스무 곳을 갔든 같은 그림이 나온다.
 */
export function projectKorea(
  p: LatLng,
  box: { x: number; y: number; w: number; h: number },
): { x: number; y: number } {
  const { minLng, maxLng, minLat, maxLat } = KOREA_BOUNDS
  // 위도에 따라 경도 간격이 좁아진다 — 보정하지 않으면 한국이 옆으로 퍼진다.
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const spanX = (maxLng - minLng) * cos
  const spanY = maxLat - minLat
  const k = Math.min(box.w / spanX, box.h / spanY)
  const drawW = spanX * k
  const drawH = spanY * k
  const ox = box.x + (box.w - drawW) / 2
  const oy = box.y + (box.h - drawH) / 2
  return {
    x: ox + (p.lng - minLng) * cos * k,
    y: oy + drawH - (p.lat - minLat) * k,
  }
}
