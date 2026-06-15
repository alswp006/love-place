import { describe, it, expect } from 'vitest'
import { interpretRows } from '@/lib/sync/versionedUpdate'

// useUnmarkVisited는 활성 방문행을 version 조건부 soft-delete한다.
// 0행 반환(서버 version↑) = 충돌 → onConflict 호출(LWW 금지). 그 계약을 interpretRows로 못박는다.
describe('가봤어요 토글 — 방문 취소 충돌 계약', () => {
  it('soft-delete가 1행을 돌려주면 ok(취소 성공)', () => {
    expect(interpretRows([{ id: 'v1' }]).status).toBe('ok')
  })
  it('soft-delete가 0행이면 conflict(상대가 먼저 수정/삭제) — 무음 덮어쓰기 금지', () => {
    expect(interpretRows([]).status).toBe('conflict')
  })
  it('충돌 행이 하나라도 있으면 conflicted=true로 집계된다(계약)', () => {
    // 활성 방문행 2개 중 1개가 0행(conflict)이면 conflicted=true.
    const results = [interpretRows([{ id: 'v1' }]), interpretRows([])]
    const conflicted = results.some((r) => r.status === 'conflict')
    expect(conflicted).toBe(true)
  })
})
