import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// 0013 마이그레이션 계약(R1.1): itineraries.course_key + soft-delete 인식 부분 유니크.
// DB는 직접 붙지 않으므로 SQL 파일 내용을 계약으로 검증한다(0002의 부분 유니크 패턴 미러).
const SQL_PATH = resolve(__dirname, '../../supabase/migrations/0013_itinerary_course_key.sql')

describe('migration 0013 — itineraries.course_key + 부분 유니크 인덱스', () => {
  it('마이그레이션 파일이 존재한다', () => {
    expect(existsSync(SQL_PATH)).toBe(true)
  })

  it('course_key 컬럼을 멱등(IF NOT EXISTS)으로 추가한다', () => {
    const sql = readFileSync(SQL_PATH, 'utf8')
    expect(sql).toMatch(/ALTER TABLE\s+public\.itineraries/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+course_key\s+text/i)
  })

  it('(couple_id, course_key) 부분 유니크 인덱스를 멱등으로 만든다', () => {
    const sql = readFileSync(SQL_PATH, 'utf8')
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS\s+uq_itineraries_course_key/i)
    expect(sql).toMatch(/ON\s+public\.itineraries\s*\(\s*couple_id\s*,\s*course_key\s*\)/i)
  })

  it('부분 인덱스는 살아있는 행(course_key 존재 + deleted_at NULL)만 대상으로 한다', () => {
    const sql = readFileSync(SQL_PATH, 'utf8')
    expect(sql).toMatch(/WHERE\s+course_key\s+IS NOT NULL\s+AND\s+deleted_at\s+IS NULL/i)
  })
})
