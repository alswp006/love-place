import { supabase } from '@/lib/supabase/client'
import type { ZipPhoto } from './buildZip'

// 내보내기 v0(P0g / 설계서 §9.1 단계0 · §10.4 회수권) — 커플 전체 데이터 JSON 덤프.
// RLS가 자기 커플만 반환(§10.2). 0010 휴지통 정책 적용 시 soft-deleted 행도 포함(완전 회수).
// 1급 요구③(관계 종료 시 데이터 소유권)의 토대.

export const EXPORT_VERSION = 1

// 커플 범위 공유 테이블 = `couple_id`를 가진 테이블 **전부**.
//
// ⚠️ 새 테이블을 만들면 여기에 반드시 더한다. 이 목록은 §10.4(관계 종료 시 회수권)의 실체다 —
// 빠진 테이블은 사용자가 영영 못 가져간다. 예전엔 손으로 관리하다 0016~0023의 새 표
// 일곱 개가 통째로 빠졌고, 테스트가 "핵심 8개가 들어있나"만 보는 부분집합 검사라 통과했다.
// 지금은 dumpSchema.test.ts가 **마이그레이션을 직접 파싱해** 이 목록과 등호로 비교한다.
export const EXPORT_TABLES = [
  'profiles', // 두 사람의 표시 이름·색 — 없으면 덤프의 created_by가 익명 UUID일 뿐이다
  'places',
  'wishes',
  'visits',
  'trips',
  'photos',
  'events',
  'event_categories',
  'event_completions',
  'comments',
  'itineraries',
  'reactions',
  'collections',
  'place_collections',
  'trip_sessions',
  'route_points', // 실제 이동 궤적 — 가장 사적인 데이터라 회수권이 특히 중요
  'location_access_log', // 상대가 내 위치를 언제 봤는지(감사 기록)
  'consent_log', // 위치·사진 상호 동의 이력
] as const
export type ExportTable = (typeof EXPORT_TABLES)[number]

/**
 * 일부러 뺀 테이블과 그 이유. 테스트가 이 목록을 근거로 등호 검사를 한다 —
 * "빠뜨림"과 "의도적 제외"를 구분하기 위해 이유 없이 뺄 수 없게 만든다.
 */
export const EXPORT_SKIPPED: Record<string, string> = {
  regions: '글로벌 마스터(우리 데이터 아님). couple_id도 없다.',
  proxy_cache: '외부 API 응답 캐시(인프라). 우리 콘텐츠가 아니고 재생성된다.',
  proxy_call_log: '레이트리밋·비용 상한용 호출 계량(인프라). 개인 기록이 아니다.',
  couples: 'couple_id가 아니라 id로 잡히는 행 — 아래에서 따로 담는다.',
}

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
  // couples는 couple_id가 아니라 id로 잡힌다 — 연결 상태·연결 시각이 여기 있어서 뺄 수 없다.
  const { data: couple, error: coupleErr } = await supabase
    .from('couples')
    .select('*')
    .eq('id', coupleId)
  if (coupleErr) throw new Error(`couples 내보내기 실패: ${coupleErr.message}`)
  tables['couples'] = couple ?? []
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

// PhotoRow는 0001_core_schema.sql:140(storage_url text NOT NULL)에 맞춘 로컬 핸드타입 계약.
// photos 테이블은 database.types.ts 스텁 밖이고, storage download는 Database가 타입하지 않음.
type PhotoRow = { id: string; storage_url: string }

// 사진 blob 다운로드(RLS-scoped, private 'photos' 버킷). storage_url은 표시본(1600px)을
// 가리킨다 — 원본은 보관하지 않는다(lib/photos/resize.ts). 실패 사진은 건너뜀(번들 중단 안 함).
export async function fetchPhotoBlobs(_coupleId: string, rows: PhotoRow[]): Promise<ZipPhoto[]> {
  const out: ZipPhoto[] = []
  for (const r of rows) {
    const { data, error } = await supabase.storage.from('photos').download(r.storage_url)
    if (error || !data) continue
    const ext = r.storage_url.split('.').pop() || 'bin'
    out.push({ name: `photos/${r.id}.${ext}`, bytes: new Uint8Array(await data.arrayBuffer()) })
  }
  return out
}

export function downloadBlob(filename: string, bytes: Uint8Array): void {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([ab], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
