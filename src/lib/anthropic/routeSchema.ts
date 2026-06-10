// AI 경로 출력 구조 + strict 검증 + 장소 화이트리스트(환각 차단) — §5.6 / CLAUDE.md §8.
// zod 미설치 → 동등한 수기 검증기(외부 응답을 신뢰 전 파싱). 순수 함수(테스트로 못박음).
// 서버(Edge Function)는 Deno라 이 파일을 import 못 하므로 동일 로직을 복제한다(naver normalize와 동일 패턴).

export type RouteStop = {
  placeId: string
  arrive: string // 'HH:mm' (AI 제안값 — 앱이 recompute로 재계산해 덮어씀)
  stayMin: number
  moveMemo: string
  reason: string
}
export type RouteDay = { day: number; stops: RouteStop[] }
export type RoutePlan = { days: RouteDay[] }

export type ValidateResult = { ok: true; plan: RoutePlan } | { ok: false; error: string }

/**
 * AI JSON 출력을 strict 검증 + 화이트리스트(입력 place_id 집합 밖이면 거부 = 환각 차단).
 * 실패 시 폴백(fallbackTsp)으로 대체해야 한다.
 */
export function validateRoute(input: unknown, allowedPlaceIds: ReadonlySet<string>): ValidateResult {
  if (typeof input !== 'object' || input === null) return { ok: false, error: '출력이 객체가 아님' }
  const days = (input as { days?: unknown }).days
  if (!Array.isArray(days)) return { ok: false, error: 'days 배열 없음' }

  const outDays: RouteDay[] = []
  for (const d of days) {
    if (typeof d !== 'object' || d === null) return { ok: false, error: 'day 형식 오류' }
    const dayNum = (d as { day?: unknown }).day
    const stops = (d as { stops?: unknown }).stops
    if (typeof dayNum !== 'number' || !Array.isArray(stops)) return { ok: false, error: 'day/stops 형식 오류' }

    const outStops: RouteStop[] = []
    for (const s of stops) {
      if (typeof s !== 'object' || s === null) return { ok: false, error: 'stop 형식 오류' }
      const so = s as Record<string, unknown>
      const placeId = so.placeId
      if (typeof placeId !== 'string') return { ok: false, error: 'placeId 누락' }
      if (!allowedPlaceIds.has(placeId)) return { ok: false, error: `화이트리스트 밖 장소(환각): ${placeId}` }
      outStops.push({
        placeId,
        arrive: typeof so.arrive === 'string' ? so.arrive : '',
        stayMin: typeof so.stayMin === 'number' && so.stayMin >= 0 ? so.stayMin : 60,
        moveMemo: typeof so.moveMemo === 'string' ? so.moveMemo : '',
        reason: typeof so.reason === 'string' ? so.reason : '',
      })
    }
    outDays.push({ day: dayNum, stops: outStops })
  }
  return { ok: true, plan: { days: outDays } }
}
