import { supabase } from '@/lib/supabase/client'

// 동선 종료 시 자동 연결(마찰 최소) — '오늘이 기간에 드는 여행'이 딱 하나면 그 여행으로 자동 연결하고,
// 없거나 둘 이상(모호)이면 수동 연결(미연결 트레이)로 폴백한다.

export type CoveringTrip = { id: string; title: string; start_date: string; end_date: string }

/** 그 날짜를 포함하는 여행이 '정확히 하나'일 때만 반환(모호하면 null → 수동 폴백). 순수. */
export function soleTripCovering(trips: CoveringTrip[], day: string): CoveringTrip | null {
  const covering = trips.filter((t) => t.start_date <= day && day <= t.end_date)
  return covering.length === 1 ? covering[0]! : null
}

/** 로컬 날짜 YYYY-MM-DD — 여행 start/end_date와 같은 기준(사용자 시간대). 순수. */
export function localDayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 해당 날짜를 포함하는 여행 조회(유일성 판정용 — 2건이면 이미 모호). 실패는 빈 배열(자동연결은 best-effort). */
export async function findTripsCoveringDay(coupleId: string, day: string): Promise<CoveringTrip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('id, title, start_date, end_date')
    .eq('couple_id', coupleId)
    .is('deleted_at', null)
    .lte('start_date', day)
    .gte('end_date', day)
    .limit(2)
  if (error) return []
  return (data ?? []) as CoveringTrip[]
}
