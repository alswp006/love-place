import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ConsentSheet — 4종 분리 동의, 기본 OFF, (b)제3자 유보해도 닫기 가능. useConsent 모킹.
const c = vi.hoisted(() => ({
  canRecord: false,
  canProvide: false,
  notifyMode: 'IMMEDIATE' as 'IMMEDIATE' | 'BATCHED_30D',
  grant: vi.fn(),
  withdraw: vi.fn(),
  data: [] as unknown[],
  isLoading: false,
  isPending: false,
}))
vi.mock('@/hooks/useConsent', async (orig) => {
  const real = await orig<typeof import('@/hooks/useConsent')>()
  return { ...real, useConsent: () => c }
})

import { ConsentSheet } from '@/components/journey/ConsentSheet'

beforeEach(() => {
  c.canRecord = false
  c.canProvide = false
  c.notifyMode = 'IMMEDIATE'
  c.grant.mockReset()
  c.withdraw.mockReset()
})

describe('ConsentSheet — 위치 4종 동의', () => {
  it('기본 OFF: 수집·제공 체크박스가 모두 해제 상태', () => {
    render(<ConsentSheet open onClose={vi.fn()} coupleId="c1" userId="u1" />)
    expect(screen.getByLabelText('개인위치정보 수집·이용 동의')).not.toBeChecked()
    expect(screen.getByLabelText('상대에게 동선 제공 동의 (선택)')).not.toBeChecked()
  })

  it('수집 동의 토글 시 grant(COLLECT_USE) 호출', () => {
    render(<ConsentSheet open onClose={vi.fn()} coupleId="c1" userId="u1" />)
    fireEvent.click(screen.getByLabelText('개인위치정보 수집·이용 동의'))
    expect(c.grant).toHaveBeenCalledWith('COLLECT_USE', expect.objectContaining({ scope: 'RECAP' }))
  })

  it('이미 동의된 수집을 끄면 withdraw(COLLECT_USE) 호출', () => {
    c.canRecord = true
    render(<ConsentSheet open onClose={vi.fn()} coupleId="c1" userId="u1" />)
    expect(screen.getByLabelText('개인위치정보 수집·이용 동의')).toBeChecked()
    fireEvent.click(screen.getByLabelText('개인위치정보 수집·이용 동의'))
    expect(c.withdraw).toHaveBeenCalledWith('COLLECT_USE', expect.any(Object))
  })

  it('제3자 제공은 (선택) 표기 + 유보해도 닫기 가능', () => {
    const onClose = vi.fn()
    render(<ConsentSheet open onClose={onClose} coupleId="c1" userId="u1" />)
    expect(screen.getByText('(선택)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('통보 방식 라디오: 30일 묶음 선택 시 grant(NOTIFY_METHOD, BATCHED_30D)', () => {
    render(<ConsentSheet open onClose={vi.fn()} coupleId="c1" userId="u1" />)
    fireEvent.click(screen.getByLabelText('30일 묶음 알림'))
    expect(c.grant).toHaveBeenCalledWith('NOTIFY_METHOD', expect.objectContaining({ notifyMode: 'BATCHED_30D' }))
  })
})
