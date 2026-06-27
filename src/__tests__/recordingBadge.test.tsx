import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecordingBadge } from '@/components/journey/RecordingBadge'

describe('RecordingBadge — 기록 중 인디케이터', () => {
  it('RECORDING: 텍스트+aria-live 상태 + 일시중지/종료 버튼', () => {
    const onPause = vi.fn()
    const onStop = vi.fn()
    render(<RecordingBadge status="RECORDING" onPause={onPause} onResume={vi.fn()} onStop={onStop} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('기록 중')
    expect(status).toHaveAttribute('aria-live', 'polite')
    fireEvent.click(screen.getByLabelText('동선 기록 일시중지'))
    expect(onPause).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByLabelText('동선 기록 종료'))
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('PAUSED: "일시중지됨" + 재개 버튼', () => {
    const onResume = vi.fn()
    render(<RecordingBadge status="PAUSED" onPause={vi.fn()} onResume={onResume} onStop={vi.fn()} />)
    expect(screen.getByText('일시중지됨')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('동선 기록 재개'))
    expect(onResume).toHaveBeenCalledOnce()
  })
})
