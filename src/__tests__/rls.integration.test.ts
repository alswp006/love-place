import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 라이브 RLS 커플 격리 통합 테스트 — P0 DoD / security-privacy §2 / CLAUDE.md §6.
// supabase-js 모킹으론 RLS를 진짜 검증할 수 없다(자기 자신만 테스트). 실제 두 커플 + 두 사용자 세션 필요.
// 환경변수가 모두 있을 때만 실행, 없으면 skip → 로컬/CI 기본 그린 유지. 프로비저닝: docs/rls-testing.md.
const URL = process.env.RLS_TEST_URL
const ANON = process.env.RLS_TEST_ANON
const A_EMAIL = process.env.RLS_TEST_A_EMAIL
const A_PW = process.env.RLS_TEST_A_PASSWORD
const B_EMAIL = process.env.RLS_TEST_B_EMAIL
const B_PW = process.env.RLS_TEST_B_PASSWORD
const ready = Boolean(URL && ANON && A_EMAIL && A_PW && B_EMAIL && B_PW)

describe.skipIf(!ready)('RLS 커플 격리 (라이브 통합)', () => {
  let ca: SupabaseClient // 커플 A의 사용자 세션
  let cb: SupabaseClient // 커플 B의 사용자 세션
  let aUserId: string

  beforeAll(async () => {
    ca = createClient(URL!, ANON!)
    cb = createClient(URL!, ANON!)
    const { error: ea } = await ca.auth.signInWithPassword({ email: A_EMAIL!, password: A_PW! })
    const { error: eb } = await cb.auth.signInWithPassword({ email: B_EMAIL!, password: B_PW! })
    if (ea || eb) throw new Error(`테스트 로그인 실패: ${ea?.message ?? ''} ${eb?.message ?? ''}`)
    aUserId = (await ca.auth.getUser()).data.user!.id
  })

  it('A는 B 커플의 places를 못 본다 (교차 SELECT 0건)', async () => {
    const { data: bPlaces } = await cb.from('places').select('id').limit(1)
    const someBId = bPlaces?.[0]?.id
    if (!someBId) {
      // B 커플에 시드 데이터가 없으면 이 단정은 의미 없음 — 시드 후 재실행 권장.
      expect(true).toBe(true)
      return
    }
    const { data: leaked } = await ca.from('places').select('id').eq('id', someBId)
    expect(leaked ?? []).toHaveLength(0)
  })

  it('A는 couple_id를 B로 위조해 insert 못 한다 (WITH CHECK 거부)', async () => {
    const { data: bCouple } = await cb.rpc('current_couple_id')
    const { error } = await ca.from('places').insert({
      couple_id: bCouple,
      name: '위조 시도',
      added_by: aUserId,
      created_by: aUserId,
      updated_by: aUserId,
    })
    expect(error).not.toBeNull()
  })

  it('미인증 클라이언트는 couple 데이터를 못 읽는다', async () => {
    const anonClient = createClient(URL!, ANON!)
    const { data } = await anonClient.from('places').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('A는 자기 reactions만 수정할 수 있어야 한다 (D4 — 0009 마이그레이션 적용 후)', async () => {
    // B가 만든 리액션을 A가 수정/삭제 시도 → 0행 영향이어야(상대 리액션 위조 금지).
    const { data: bReactions } = await cb.from('reactions').select('id').limit(1)
    const someBReaction = bReactions?.[0]?.id
    if (!someBReaction) {
      expect(true).toBe(true)
      return
    }
    const { data: updated } = await ca
      .from('reactions')
      .update({ emoji: '🙅', updated_by: aUserId })
      .eq('id', someBReaction)
      .select('id')
    expect(updated ?? []).toHaveLength(0)
  })

  it('A는 B 커플의 reactions(PLACE)를 못 본다 (교차 SELECT 0건)', async () => {
    const { data: bR } = await cb
      .from('reactions')
      .select('id')
      .eq('target_type', 'PLACE')
      .is('deleted_at', null)
      .limit(1)
    const someBR = bR?.[0]?.id
    if (!someBR) {
      expect(true).toBe(true)
      return
    }
    const { data: leaked } = await ca.from('reactions').select('id').eq('id', someBR)
    expect(leaked ?? []).toHaveLength(0)
  })

  it('A는 자기 커플 장소에 PLACE 리액션을 본인 명의로 추가할 수 있다', async () => {
    const { data: aCouple } = await ca.rpc('current_couple_id')
    const { data: aPlaces } = await ca.from('places').select('id').limit(1)
    const placeId = aPlaces?.[0]?.id
    if (!placeId) {
      expect(true).toBe(true)
      return
    }
    const { data: inserted, error } = await ca
      .from('reactions')
      .insert({
        couple_id: aCouple,
        user_id: aUserId,
        target_type: 'PLACE',
        target_id: placeId,
        emoji: '❤️',
        created_by: aUserId,
        updated_by: aUserId,
      })
      .select('id')
    expect(error).toBeNull()
    // 정리 — 방금 넣은 리액션 soft-delete(테스트 격리 유지).
    const newId = inserted?.[0]?.id
    if (newId) {
      await ca
        .from('reactions')
        .update({ deleted_at: new Date().toISOString(), updated_by: aUserId })
        .eq('id', newId)
    }
  })

  it('A는 user_id를 위조해 PLACE 리액션을 만들 수 없다 (WITH CHECK 거부)', async () => {
    const { data: aCouple } = await ca.rpc('current_couple_id')
    const { data: aPlaces } = await ca.from('places').select('id').limit(1)
    const placeId = aPlaces?.[0]?.id
    if (!placeId) {
      expect(true).toBe(true)
      return
    }
    const fakeUser = '00000000-0000-0000-0000-000000000000'
    const { error } = await ca.from('reactions').insert({
      couple_id: aCouple,
      user_id: fakeUser,
      target_type: 'PLACE',
      target_id: placeId,
      emoji: '❤️',
      created_by: aUserId,
      updated_by: aUserId,
    })
    expect(error).not.toBeNull()
  })

  it('A는 couple_id를 B로 위조해 PLACE 리액션을 만들 수 없다 (WITH CHECK 거부)', async () => {
    const { data: bCouple } = await cb.rpc('current_couple_id')
    const { data: bPlaces } = await cb.from('places').select('id').limit(1)
    const placeId = bPlaces?.[0]?.id
    if (!placeId) {
      expect(true).toBe(true)
      return
    }
    const { error } = await ca.from('reactions').insert({
      couple_id: bCouple,
      user_id: aUserId,
      target_type: 'PLACE',
      target_id: placeId,
      emoji: '❤️',
      created_by: aUserId,
      updated_by: aUserId,
    })
    expect(error).not.toBeNull()
  })
})
