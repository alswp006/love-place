import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// JourneyRecordControl(지도 A안) — 동의 없으면 유도, 있으면 시작 버튼, 기록 중엔 RecordingBadge.
const consent = vi.hoisted(() => ({ canRecord: true }))
const rec = vi.hoisted(() => ({
  status: 'idle' as 'idle' | 'recording' | 'paused',
  isRecording: false,
  isPaused: false,
  sessionId: null as string | null,
  start: vi.fn(async () => {}),
  pause: vi.fn(async () => {}),
  resume: vi.fn(async () => {}),
  end: vi.fn(async () => {}),
}))
vi.mock('@/hooks/useConsent', async (orig) => {
  const real = await orig<typeof import('@/hooks/useConsent')>()
  return { ...real, useConsent: () => ({ ...consent, canProvide: false, notifyMode: 'IMMEDIATE', grant: vi.fn(), withdraw: vi.fn(), data: [], isLoading: false }) }
})
vi.mock('@/hooks/useJourneyRecording', () => ({ useJourneyRecording: () => rec }))
const h = vi.hoisted(() => ({
  show: vi.fn(),
  link: vi.fn(async () => {}),
  todayTrips: [] as { id: string; title: string; start_date: string; end_date: string }[],
}))
vi.mock('@/components/common/ToastProvider', () => ({ useToast: () => ({ show: h.show }) }))
vi.mock('@/hooks/useOrphanSessions', () => ({
  useLinkSessionToTrip: () => ({ link: h.link, isPending: false }),
}))
// 자동 연결 — 조회만 mock(soleTripCovering/localDayKey는 실제 규칙 사용).
vi.mock('@/lib/journey/autoLink', async (orig) => {
  const real = await orig<typeof import('@/lib/journey/autoLink')>()
  return { ...real, findTripsCoveringDay: vi.fn(async () => h.todayTrips) }
})

import { JourneyRecordControl } from '@/components/journey/JourneyRecordControl'

function renderControl() {
  return render(
    <MemoryRouter>
      <JourneyRecordControl coupleId="c1" userId="u1" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  consent.canRecord = true
  rec.status = 'idle'
  rec.isRecording = false
  rec.isPaused = false
  rec.start.mockReset().mockResolvedValue(undefined)
  // end는 자동 연결에 쓸 {id, version(종료 후)}을 반환한다.
  rec.end.mockReset().mockResolvedValue({ id: 's1', version: 2 })
  h.show.mockClear()
  h.link.mockClear()
  h.todayTrips = []
})

describe('JourneyRecordControl', () => {
  it('동의 있고 idle: "여행 동선 시작" → start 호출', () => {
    renderControl()
    fireEvent.click(screen.getByRole('button', { name: /여행 동선 시작/ }))
    expect(rec.start).toHaveBeenCalledOnce()
  })

  it('동의 없으면 그 자리에서 ConsentSheet를 연다(탭 이동 강제 없음, 시작 버튼 없음)', () => {
    consent.canRecord = false
    renderControl()
    expect(screen.queryByRole('button', { name: /여행 동선 시작/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /위치 동의/ }))
    expect(screen.getByRole('dialog', { name: '위치 동선 동의 관리' })).toBeInTheDocument()
  })

  it('기록 중: RecordingBadge + 종료 시 end 호출', () => {
    rec.status = 'recording'
    rec.isRecording = true
    renderControl()
    expect(screen.getByText('기록 중')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('동선 기록 종료'))
    expect(rec.end).toHaveBeenCalledOnce()
  })

  it('종료: 오늘을 포함하는 여행이 하나면 자동 연결 + 여행명 토스트', async () => {
    rec.status = 'recording'
    rec.isRecording = true
    const today = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const day = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
    h.todayTrips = [{ id: 't1', title: '속초 여행', start_date: day, end_date: day }]
    renderControl()
    fireEvent.click(screen.getByLabelText('동선 기록 종료'))
    await waitFor(() => expect(h.link).toHaveBeenCalledWith({ id: 's1', version: 2, tripId: 't1' }))
    expect(h.show).toHaveBeenCalledWith(expect.stringContaining('속초 여행'))
  })

  it('종료: 포함 여행이 없으면 연결 없이 수동 폴백 안내', async () => {
    rec.status = 'recording'
    rec.isRecording = true
    h.todayTrips = []
    renderControl()
    fireEvent.click(screen.getByLabelText('동선 기록 종료'))
    await waitFor(() => expect(h.show).toHaveBeenCalledWith(expect.stringContaining('우리')))
    expect(h.link).not.toHaveBeenCalled()
  })
})
