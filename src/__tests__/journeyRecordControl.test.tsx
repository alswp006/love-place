import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
vi.mock('@/components/common/ToastProvider', () => ({ useToast: () => ({ show: vi.fn() }) }))

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
  rec.end.mockReset().mockResolvedValue(undefined)
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
})
