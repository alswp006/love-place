import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Task 5(R2): EventSheet 시간 검증 + 인라인 에러(role="alert") + 입력 보존.
// buildEventTimes(Task 1)로 검증해서, 동일 시각/역전 범위면 onCreate/onUpdate에 도달하지 않고
// 인라인 에러를 띄우고 로컬 입력(제목)을 보존한다. 고친 뒤 저장하면 정상 페이로드(start<end)가 나간다.
import { EventSheet } from '@/components/calendar/EventSheet'
import type { EventRow } from '@/hooks/useEvents'
import { formatTime, DISPLAY_TZ } from '@/lib/calendar/eventDays'

function makeRow(over: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1',
    title: '여행 일정',
    start: '2026-06-20T01:00:00Z', // Seoul 10:00, UTC 01:00 (오프셋이 다르면 시각이 갈림)
    end: '2026-06-20T03:00:00Z',
    is_all_day: false,
    time_zone: DISPLAY_TZ,
    visibility: 'SHARED',
    participants: 'BOTH',
    owner_id: 'u1',
    place_id: null,
    memo: null,
    recurrence_rule: null,
    reminders: [],
    version: 1,
    ...over,
  }
}

function setup(overrides: Partial<Parameters<typeof EventSheet>[0]> = {}) {
  const onCreate = vi.fn()
  const onUpdate = vi.fn()
  const onDelete = vi.fn()
  const onClose = vi.fn()
  render(
    <EventSheet
      initial={null}
      defaultDate="2026-06-20"
      myId="u1"
      busy={false}
      profiles={{}}
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

describe('EventSheet 시간 검증·인라인 에러·입력 보존(R2, Task 5)', () => {
  it('시작=종료면 onCreate 미호출 + 인라인 에러(role="alert") + 제목 보존', () => {
    const { onCreate } = setup()
    // 종일 해제(기본 false라 이미 시간 입력이 보이지만, 명시적으로 유지)
    fireEvent.change(screen.getByLabelText('일정 제목'), { target: { value: '데이트' } })
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '10:00' } })

    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onCreate).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/시작.*종료 시간이 같아요/)
    // 입력 보존: 제목은 그대로 남아있다.
    expect(screen.getByLabelText('일정 제목')).toHaveValue('데이트')
  })

  it('에러 후 종료 시각을 고치면 onCreate가 1회 호출되고 payload는 start<end', () => {
    const { onCreate } = setup()
    fireEvent.change(screen.getByLabelText('일정 제목'), { target: { value: '데이트' } })
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '10:00' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(onCreate).not.toHaveBeenCalled()

    // 종료를 12:00으로 고친 뒤 저장
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '12:00' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    const payload = onCreate.mock.calls[0]![0]
    expect(payload.title).toBe('데이트')
    expect(new Date(payload.start).getTime()).toBeLessThan(new Date(payload.end).getTime())
    // 에러는 사라진다.
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('EventSheet 일정-전용 폼(장소 연결 필드 제거)', () => {
  // "일정은 말그대로 일정만 관리" — 추가/수정 폼에서 장소 연결(PlacePicker) 필드를 없앤다.
  // 장소→일정 자동 결합은 원래 없었고, 폼의 선택적 PlacePicker가 유일한 장소 진입점이었다.
  it('추가 모드에서 장소 검색/연결 필드를 렌더하지 않는다', () => {
    setup()
    expect(screen.queryByLabelText('장소 검색')).toBeNull()
    expect(screen.queryByPlaceholderText('저장된 장소 연결(선택)')).toBeNull()
    expect(screen.queryByText(/저장된 장소가 없어요/)).toBeNull()
  })

  it('저장 시 payload에 place_id/placeId가 없다(일정만 생성)', () => {
    const { onCreate } = setup()
    fireEvent.change(screen.getByLabelText('일정 제목'), { target: { value: '카페 가기' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    const payload = onCreate.mock.calls[0]![0]
    expect(payload).not.toHaveProperty('placeId')
    expect(payload).not.toHaveProperty('place_id')
  })
})

describe('EventSheet 이벤트별 타임존 표시(R4, Task 20)', () => {
  it('time_zone이 다른 tz면 tzNote 라벨을 렌더한다', () => {
    // 'Asia/Tokyo'는 Seoul과 같은 +09 오프셋이라 라벨 텍스트(eventTz 명시)만으로 다름을 표시한다.
    setup({ initial: makeRow({ time_zone: 'Asia/Tokyo' }) })
    expect(screen.getByText(/이 일정은 Asia\/Tokyo 기준/)).toBeInTheDocument()
  })

  it('오프셋이 다른 tz면 Seoul과 다른 현지시각으로 라벨·입력을 표시한다', () => {
    // UTC(+00)는 Seoul(+09)과 오프셋이 달라 표시 시각이 갈린다(현지시각 노출의 의의).
    const start = '2026-06-20T01:00:00Z'
    setup({ initial: makeRow({ time_zone: 'UTC', start }) })
    const localTime = formatTime(start, 'UTC') // 01:00
    expect(localTime).not.toBe(formatTime(start, DISPLAY_TZ)) // Seoul 10:00과 다름
    expect(screen.getByText(`이 일정은 UTC 기준 ${localTime}`)).toBeInTheDocument()
    // 시작 시각 입력도 evTz(UTC) 기준으로 채워진다.
    expect(screen.getByLabelText('시작 시각')).toHaveValue(localTime)
  })

  it('time_zone이 DISPLAY_TZ와 같으면 tzNote를 렌더하지 않는다', () => {
    setup({ initial: makeRow({ time_zone: DISPLAY_TZ }) })
    expect(screen.queryByText(/이 일정은/)).toBeNull()
  })

  // 회귀(저장 경로 대칭): 표시 경로가 evTz로 벽시계를 채우므로 저장도 evTz로 해석해야 한다.
  // 비-DISPLAY_TZ 이벤트를 아무 필드도 건드리지 않고 저장 → start/end가 원본 ISO와 동일(round-trip identity).
  // 과거(하드코딩 +09:00) 구현에선 -9h 드리프트로 실패했던 케이스 — 무음 덮어쓰기(LWW) 차단(§4).
  it('비-DISPLAY_TZ(UTC) 이벤트를 손대지 않고 저장하면 start/end가 원본 ISO 그대로다(드리프트 0)', () => {
    const start = '2026-06-20T01:00:00Z'
    const end = '2026-06-20T03:00:00Z'
    const { onUpdate } = setup({ initial: makeRow({ time_zone: 'UTC', start, end }) })

    fireEvent.click(screen.getByRole('button', { name: '수정' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [, , patch] = onUpdate.mock.calls[0]!
    // 원본과 동일 시각(드리프트 없음). ISO 문자열 표준화 후 비교.
    expect(new Date(patch.start).toISOString()).toBe(new Date(start).toISOString())
    expect(new Date(patch.end).toISOString()).toBe(new Date(end).toISOString())
    // tz 컬럼도 보존(컬럼 드리프트 방지 — start/end와 일관).
    expect(patch.time_zone).toBe('UTC')
  })
})
