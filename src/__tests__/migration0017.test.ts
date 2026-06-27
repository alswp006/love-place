import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// 0017 마이그레이션 계약(R6): 좌표 암호화 RPC + 하드 파기 잡.
// 설계 §3.2~3.5, §5[4][5]. DB 미접속 → SQL 파일 내용을 계약으로 검증.
const SQL_PATH = resolve(__dirname, '../../supabase/migrations/0017_route_crypto_rpc.sql')
const sql = () => readFileSync(SQL_PATH, 'utf8')

describe('migration 0017 — 좌표 암호화 RPC + 파기 잡', () => {
  it('파일이 존재한다', () => {
    expect(existsSync(SQL_PATH)).toBe(true)
  })

  it('Vault 시크릿 loc_point_key를 멱등 보장한다', () => {
    const s = sql()
    expect(s).toMatch(/CREATE EXTENSION IF NOT EXISTS supabase_vault/i)
    expect(s).toMatch(/vault\.create_secret\([\s\S]*?'loc_point_key'/i)
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION\s+public\._loc_key\(\)/i)
  })

  it('record_points: 좌표 암호화 + 멱등 + COLLECT 확인자료 + 6개월 보존', () => {
    const s = sql()
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION\s+public\.record_points\s*\(\s*p_session\s+uuid\s*,\s*p_points\s+jsonb\s*\)/i)
    expect(s).toMatch(/pgp_sym_encrypt\(pt->>'lat'/i)
    expect(s).toMatch(/pgp_sym_encrypt\(pt->>'lng'/i)
    expect(s).toMatch(/ON CONFLICT\s*\(session_id,\s*client_point_id\)\s*DO NOTHING/i)
    expect(s).toMatch(/INSERT INTO public\.location_access_log[\s\S]*'COLLECT'/i)
    expect(s).toMatch(/now\(\)\s*\+\s*interval\s*'6 months'/i)
    expect(s).toMatch(/SECURITY DEFINER/i)
  })

  it('record_points는 RECORDING 상태가 아니면 거부한다(상태 게이트)', () => {
    expect(sql()).toMatch(/IF\s+v_status\s*<>\s*'RECORDING'\s+THEN[\s\S]*RAISE EXCEPTION/i)
  })

  it('_has_consent 헬퍼 + record_points가 COLLECT_USE 동의를 서버에서 강제', () => {
    const s = sql()
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION\s+public\._has_consent\s*\(\s*p_user\s+uuid\s*,\s*p_type\s+text\s*\)/i)
    expect(s).toMatch(/IF NOT public\._has_consent\(v_owner,\s*'COLLECT_USE'\)\s+THEN\s+RAISE EXCEPTION/i)
  })

  it('get_session_points: 복호 read + 제3자 제공 동의 강제 + PROVIDE 확인자료', () => {
    const s = sql()
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION\s+public\.get_session_points\s*\(\s*p_session\s+uuid\s*\)/i)
    expect(s).toMatch(/pgp_sym_decrypt\(rp\.lat_enc/i)
    expect(s).toMatch(/pgp_sym_decrypt\(rp\.lng_enc/i)
    // 상대 열람 시 owner의 제3자 제공 동의를 서버에서 강제(제19조 — UI 토글만 의존 금지)
    expect(s).toMatch(/v_caller\s*<>\s*v_owner[\s\S]*IF NOT public\._has_consent\(v_owner,\s*'THIRD_PARTY_PROVIDE_PARTNER'\)\s+THEN\s+RAISE EXCEPTION/i)
    expect(s).toMatch(/'PROVIDE'/i)
    expect(s).toMatch(/ORDER BY rp\.recorded_at ASC/i)
  })

  it('record_points / get_session_points는 authenticated에 EXECUTE GRANT', () => {
    const s = sql()
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION\s+public\.record_points\([^)]*\)\s+TO authenticated/i)
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION\s+public\.get_session_points\([^)]*\)\s+TO authenticated/i)
  })

  it('purge 2종은 service_role 전용(authenticated REVOKE)', () => {
    const s = sql()
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION\s+public\.purge_location_data\s*\(\s*p_session\s+uuid\s*\)/i)
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION\s+public\.purge_expired_access_log\s*\(\s*\)/i)
    expect(s).toMatch(/REVOKE ALL ON FUNCTION\s+public\.purge_location_data\([^)]*\)\s+FROM[^;]*authenticated/i)
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION\s+public\.purge_location_data\([^)]*\)\s+TO service_role/i)
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION\s+public\.purge_expired_access_log\([^)]*\)\s+TO service_role/i)
  })

  it('purge_location_data는 route_points·trip_sessions + 확인자료를 동반 하드 DELETE(제24조4)', () => {
    const s = sql()
    expect(s).toMatch(/DELETE FROM public\.route_points\s+WHERE session_id = p_session/i)
    expect(s).toMatch(/DELETE FROM public\.trip_sessions\s+WHERE id = p_session/i)
    // 철회 동반 파기 — 보존기간(retain_until) 무관하게 세션 확인자료 전부 삭제(만료분만 X)
    expect(s).toMatch(/DELETE FROM public\.location_access_log\s+WHERE session_ref = p_session\s*;/i)
  })
})
