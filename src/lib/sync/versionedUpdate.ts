import { supabase } from '@/lib/supabase/client'

// 낙관적 락(version 조건부 update) — 설계서 §4.3 / web-stack.md §4.4 [비협상].
// DB에 version 자동증가 트리거가 없으므로(0003: "버전은 앱이 명시 증가") 앱이 version+1을 직접 보낸다.
// 0행 반환 = 충돌(서버 version이 더 높음) → LWW 무음 덮어쓰기 금지, 사용자에게 표시.

export class ConflictError extends Error {
  constructor(message = '상대가 먼저 수정했어요. 최신 내용으로 새로고침했어요.') {
    super(message)
    this.name = 'ConflictError'
  }
}

// 권한거부(상대 PERSONAL을 수정 시도) — 버전충돌과 메시지·처리를 분리(조사03 §2/§3).
// UI 가드(Task 6)가 보통 사전 차단하지만, 가드 누락/경합 시의 백스톱.
export class PermissionError extends Error {
  constructor(message = '이 일정은 상대만 수정할 수 있어요.') {
    super(message)
    this.name = 'PermissionError'
  }
}

export type FreshRow = { version: number; memo: string | null; visibility: 'SHARED' | 'PERSONAL'; owner_id: string } | null
/** 충돌(0행) 후 현재 서버 행을 id로 재조회. 권한거부 vs 버전충돌 판별·재시드용. */
export async function refetchEventRow(id: string): Promise<FreshRow> {
  const { data, error } = await supabase
    .from('events').select('version, memo, visibility, owner_id').eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as FreshRow) ?? null
}

export type VersionedResult<T> = { status: 'ok'; row: T } | { status: 'conflict' }

/** update().select() 결과 행 해석: 0행 = 충돌(또는 행 소멸), 1행 = 성공. 순수 함수(테스트로 못박음). */
export function interpretRows<T>(rows: T[]): VersionedResult<T> {
  if (rows.length === 0) return { status: 'conflict' }
  return { status: 'ok', row: rows[0]! }
}

/**
 * version 조건부 update. patch에 version은 넣지 말 것(여기서 expected+1로 채운다).
 * `.eq('version', expectedVersion)`로 충돌 감지, `.is('deleted_at', null)`로 살아있는 행만.
 */
export async function versionedUpdate<T = unknown>(
  table: string,
  id: string,
  expectedVersion: number,
  patch: Record<string, unknown>,
): Promise<VersionedResult<T>> {
  const { data, error } = await supabase
    .from(table)
    .update({ ...patch, version: expectedVersion + 1 })
    .eq('id', id)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select()
  if (error) throw new Error(error.message)
  return interpretRows<T>((data ?? []) as T[])
}

/** 휴지통으로 보내기(soft-delete) — deleted_at만 채운다(물리삭제 금지 §4.3). 살아있는 행만, version 조건부. */
export async function softDelete(
  table: string,
  id: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<VersionedResult<unknown>> {
  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString(), version: expectedVersion + 1, updated_by: updatedBy })
    .eq('id', id)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select()
  if (error) throw new Error(error.message)
  return interpretRows((data ?? []) as unknown[])
}

/** 복구 — 삭제된 행의 deleted_at을 null로. 삭제된 행만(deleted_at IS NOT NULL), version 조건부.
 *  주의: 기본 RLS USING은 deleted_at IS NULL만 허용 → 0010_trash_rls.sql 적용 후에만 동작. */
export async function restore(
  table: string,
  id: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<VersionedResult<unknown>> {
  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at: null, version: expectedVersion + 1, updated_by: updatedBy })
    .eq('id', id)
    .eq('version', expectedVersion)
    .not('deleted_at', 'is', null)
    .select()
  if (error) throw new Error(error.message)
  return interpretRows((data ?? []) as unknown[])
}
