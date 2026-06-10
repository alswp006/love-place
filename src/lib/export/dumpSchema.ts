import { supabase } from '@/lib/supabase/client'

// 내보내기 v0(P0g / 설계서 §9.1 단계0 · §10.4 회수권) — 커플 전체 데이터 JSON 덤프.
// RLS가 자기 커플만 반환(§10.2). 0010 휴지통 정책 적용 시 soft-deleted 행도 포함(완전 회수).
// 1급 요구③(관계 종료 시 데이터 소유권)의 토대.

export const EXPORT_VERSION = 1

// 커플 범위 공유 테이블(couple_id 보유). regions(글로벌 마스터)·profiles는 별도.
export const EXPORT_TABLES = [
  'places',
  'wishes',
  'visits',
  'trips',
  'photos',
  'events',
  'itineraries',
  'reactions',
] as const
export type ExportTable = (typeof EXPORT_TABLES)[number]

export type CoupleExport = {
  version: number
  exportedAt: string
  coupleId: string
  tables: Record<string, unknown[]>
}

/** 테이블 데이터를 버전 봉투로 조립(순수 함수 — 테스트로 못박음). version 필드로 스키마 안정성 보장. */
export function assembleExport(coupleId: string, tables: Record<string, unknown[]>, isoNow: string): CoupleExport {
  return { version: EXPORT_VERSION, exportedAt: isoNow, coupleId, tables }
}

/** 내 커플 데이터 전체 조회(RLS가 타 커플 차단) → 버전 봉투. */
export async function fetchCoupleExport(coupleId: string): Promise<CoupleExport> {
  const tables: Record<string, unknown[]> = {}
  for (const t of EXPORT_TABLES) {
    const { data, error } = await supabase.from(t).select('*').eq('couple_id', coupleId)
    if (error) throw new Error(`${t} 내보내기 실패: ${error.message}`)
    tables[t] = data ?? []
  }
  return assembleExport(coupleId, tables, new Date().toISOString())
}

/** JSON을 파일로 다운로드(브라우저). */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
