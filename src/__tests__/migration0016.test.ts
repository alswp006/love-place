import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// 0016 마이그레이션 계약(R6): 동선 기록 4테이블 + RLS + realtime.
// DB에 직접 붙지 않으므로 SQL 파일 내용을 계약으로 검증한다(0013/0014 미러).
// 설계: docs/superpowers/specs/2026-06-27-r6-journey-recording-design.md §3
const SQL_PATH = resolve(__dirname, '../../supabase/migrations/0016_route_recording.sql')
const sql = () => readFileSync(SQL_PATH, 'utf8')

describe('migration 0016 — 동선 기록 테이블 + RLS', () => {
  it('마이그레이션 파일이 존재한다', () => {
    expect(existsSync(SQL_PATH)).toBe(true)
  })

  it('4개 테이블을 멱등(CREATE TABLE IF NOT EXISTS)으로 만든다', () => {
    const s = sql()
    for (const t of ['trip_sessions', 'route_points', 'location_access_log', 'consent_log']) {
      expect(s).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+public\\.${t}`, 'i'))
    }
  })

  it('4개 테이블 모두 RLS를 ENABLE한다', () => {
    const s = sql()
    for (const t of ['trip_sessions', 'route_points', 'location_access_log', 'consent_log']) {
      expect(s).toMatch(new RegExp(`ALTER TABLE\\s+public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`, 'i'))
    }
  })

  it('route_points는 평문 좌표 컬럼이 없고 암호화 bytea 컬럼만 가진다', () => {
    const s = sql()
    expect(s).toMatch(/lat_enc\s+bytea\s+NOT NULL/i)
    expect(s).toMatch(/lng_enc\s+bytea\s+NOT NULL/i)
    // 평문 lat/lng double precision 컬럼 정의가 없어야 한다(places의 lat과 혼동 방지: 단어경계+타입).
    expect(s).not.toMatch(/^\s*lat\s+double precision/im)
    expect(s).not.toMatch(/^\s*lng\s+double precision/im)
  })

  it('route_points는 authenticated에 GRANT를 주지 않는다(RPC 전용)', () => {
    const s = sql()
    // GRANT ... ON public.route_points ... 형태가 없어야 한다.
    expect(s).not.toMatch(/GRANT[^;]*\bpublic\.route_points\b[^;]*TO\s+authenticated/i)
  })

  it('route_points 멱등 유니크 인덱스(session_id, client_point_id)가 있다', () => {
    expect(sql()).toMatch(/UNIQUE INDEX[^;]*route_points\s*\(\s*session_id\s*,\s*client_point_id\s*\)/i)
  })

  it('location_access_log은 append-only — UPDATE/DELETE 정책이 없다', () => {
    const s = sql()
    expect(s).toMatch(/CREATE POLICY\s+lal_select\s+ON\s+public\.location_access_log\s+FOR SELECT/i)
    expect(s).toMatch(/CREATE POLICY\s+lal_insert\s+ON\s+public\.location_access_log\s+FOR INSERT/i)
    expect(s).not.toMatch(/ON\s+public\.location_access_log\s+FOR\s+(UPDATE|DELETE)/i)
  })

  it('trip_sessions는 couple 격리 RLS + current_couple_id()를 쓴다', () => {
    const s = sql()
    expect(s).toMatch(/CREATE POLICY\s+trip_sessions_couple\s+ON\s+public\.trip_sessions/i)
    expect(s).toMatch(/couple_id\s*=\s*public\.current_couple_id\(\)/i)
  })

  it('trip_sessions에 touch_updated_at 트리거를 건다', () => {
    expect(sql()).toMatch(/CREATE TRIGGER\s+trg_touch_trip_sessions[^;]*EXECUTE FUNCTION\s+public\.touch_updated_at/i)
  })

  it('trip_sessions를 realtime publication에 추가한다(route_points는 미추가)', () => {
    const s = sql()
    expect(s).toMatch(/ALTER PUBLICATION\s+supabase_realtime\s+ADD TABLE\s+public\.trip_sessions/i)
    expect(s).not.toMatch(/ALTER PUBLICATION\s+supabase_realtime\s+ADD TABLE\s+public\.route_points/i)
  })

  it('pgcrypto 확장을 보장한다', () => {
    expect(sql()).toMatch(/CREATE EXTENSION IF NOT EXISTS pgcrypto/i)
  })
})
