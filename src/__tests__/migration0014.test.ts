import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Database } from '@/lib/supabase/database.types'

// 0014 마이그레이션 계약(R3.3): profiles 동의 컬럼 + purge_trashed 자동정리 함수.
// DB는 직접 붙지 않으므로 SQL 파일 내용을 계약으로 검증한다(0013 미러).
// security-privacy §3.2(상호 동의: 여부+시각 기록) / §4(soft-delete 물리삭제는 유예 경과 후).
const SQL_PATH = resolve(__dirname, '../../supabase/migrations/0014_consent_purge.sql')

describe('migration 0014 — 동의 컬럼 + purge_trashed', () => {
  it('마이그레이션 파일이 존재한다', () => {
    expect(existsSync(SQL_PATH)).toBe(true)
  })

  it('profiles에 동의 타임스탬프 컬럼 2개를 멱등(IF NOT EXISTS)으로 추가한다', () => {
    const sql = readFileSync(SQL_PATH, 'utf8')
    expect(sql).toMatch(/ALTER TABLE\s+public\.profiles/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+location_consent_at\s+timestamptz/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+photo_consent_at\s+timestamptz/i)
  })

  it('purge_trashed 함수를 멱등(CREATE OR REPLACE)으로 정의한다', () => {
    const sql = readFileSync(SQL_PATH, 'utf8')
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.purge_trashed\s*\(\s*p_grace_days\s+int\s+DEFAULT\s+30\s*\)/i,
    )
    expect(sql).toMatch(/SECURITY DEFINER/i)
    expect(sql).toMatch(/SET search_path = public/i)
  })

  it('purge는 유예 경과(deleted_at < now() - N days) 행만 물리삭제한다', () => {
    const sql = readFileSync(SQL_PATH, 'utf8')
    expect(sql).toMatch(/deleted_at IS NOT NULL/i)
    expect(sql).toMatch(/deleted_at\s*<\s*now\(\)\s*-/i)
  })

  it('함수 실행 권한을 service_role에만 부여하고 나머지는 회수한다', () => {
    const sql = readFileSync(SQL_PATH, 'utf8')
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.purge_trashed\(int\)\s+FROM\s+public,\s*anon,\s*authenticated/i,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.purge_trashed\(int\)\s+TO\s+service_role/i,
    )
  })

  it('database.types.ts profiles.Row에 동의 컬럼이 노출된다', () => {
    type Row = Database['public']['Tables']['profiles']['Row']
    // 타입 레벨 계약: 두 컬럼이 string | null 이어야 한다.
    const sample: Pick<Row, 'location_consent_at' | 'photo_consent_at'> = {
      location_consent_at: null,
      photo_consent_at: null,
    }
    expect(sample.location_consent_at).toBeNull()
    expect(sample.photo_consent_at).toBeNull()
  })
})
