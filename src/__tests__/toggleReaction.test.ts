import { describe, it, expect } from 'vitest'
import { interpretRows } from '@/lib/sync/versionedUpdate'

// 리액션 취소는 LWW 평문 update가 아니라 version 조건부 softDelete(0행=충돌)여야 한다.
describe('❤️ 리액션 취소 — version 조건부 soft-delete 계약', () => {
  it('softDelete 1행=ok(취소 성공)', () => {
    expect(interpretRows([{ id: 'r1' }]).status).toBe('ok')
  })
  it('softDelete 0행=conflict(상대가 먼저 변경) — 무음 덮어쓰기 금지', () => {
    expect(interpretRows([]).status).toBe('conflict')
  })
})
