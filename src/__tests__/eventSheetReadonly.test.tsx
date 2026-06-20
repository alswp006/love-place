import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Task 6(R2): 상대 PERSONAL 일정은 읽기 전용(canEdit 가드).
// canEdit = visibility==='SHARED' || owner_id===myId (RLS USING 미러, 조사03 §4).
// 상대 PERSONAL이면 저장/삭제 버튼 숨김 + "상대 일정 · {소유자}" 라벨 + 입력 disabled.
import { EventSheet } from '@/components/calendar/EventSheet'
import type { EventRow } from '@/hooks/useEvents'
import type { ProfileMap } from '@/hooks/useProfiles'

const baseEvent: EventRow = {
  id: 'e1',
  title: '지민 헬스',
  start: '2026-06-20T01:00:00.000Z',
  end: '2026-06-20T02:00:00.000Z',
  is_all_day: false,
  time_zone: 'Asia/Seoul',
  visibility: 'PERSONAL',
  participants: 'OWNER_ONLY',
  owner_id: 'partner',
  place_id: null,
  memo: '운동',
  recurrence_rule: null,
  reminders: [],
  version: 1,
}

const profiles: ProfileMap = {
  partner: { id: 'partner', displayName: '지민', color: '#f0a', avatarUrl: null },
  me: { id: 'me', displayName: '나', color: '#0af', avatarUrl: null },
}

function setup(overrides: Partial<Parameters<typeof EventSheet>[0]> = {}) {
  const onCreate = vi.fn()
  const onUpdate = vi.fn()
  const onDelete = vi.fn()
  const onClose = vi.fn()
  render(
    <EventSheet
      initial={baseEvent}
      defaultDate="2026-06-20"
      myId="me"
      busy={false}
      profiles={profiles}
      places={[]}
      placesLoading={false}
      onClose={onClose}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      {...overrides}
    />,
  )
  return { onCreate, onUpdate, onDelete, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EventSheet 상대 PERSONAL 읽기 전용(R2, Task 6)', () => {
  it('상대 PERSONAL이면 저장/삭제 버튼 부재 + "상대 일정 · 지민" 라벨 + 입력 disabled', () => {
    setup()
    // 저장/삭제 버튼 숨김
    expect(screen.queryByRole('button', { name: /저장|삭제/ })).toBeNull()
    // 수정 버튼도 없음(편집 차단)
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull()
    // "상대 일정" 라벨 + 소유자 이름
    expect(screen.getByText(/상대 일정/)).toBeInTheDocument()
    expect(screen.getByText(/지민/)).toBeInTheDocument()
    // 입력들이 비활성화
    expect(screen.getByLabelText('일정 제목')).toBeDisabled()
    expect(screen.getByLabelText('메모')).toBeDisabled()
    expect(screen.getByLabelText('시작 시각')).toBeDisabled()
  })

  it('SHARED 일정이면 정상 편집 가능(수정 버튼 존재, 입력 활성)', () => {
    setup({ initial: { ...baseEvent, visibility: 'SHARED' } })
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument()
    expect(screen.getByLabelText('일정 제목')).not.toBeDisabled()
    expect(screen.queryByText(/상대 일정/)).toBeNull()
  })

  it('내 PERSONAL 일정이면 정상 편집 가능(수정 버튼 존재)', () => {
    setup({ initial: { ...baseEvent, visibility: 'PERSONAL', owner_id: 'me' } })
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument()
    expect(screen.getByLabelText('일정 제목')).not.toBeDisabled()
    expect(screen.queryByText(/상대 일정/)).toBeNull()
  })
})
