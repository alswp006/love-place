import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// LocationControlCenter — 동의 상태 + 즉시 중단(제24조2) + 동의 관리 시트. useConsent 모킹.
const c = vi.hoisted(() => ({
  canRecord: true,
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

import { LocationControlCenter } from '@/components/journey/LocationControlCenter'

beforeEach(() => {
  c.canRecord = true
  c.canProvide = false
  c.grant.mockReset()
  c.withdraw.mockReset()
})

describe('LocationControlCenter', () => {
  it('동의 상태를 색+텍스트로 표시', () => {
    render(<LocationControlCenter coupleId="c1" userId="u1" />)
    expect(screen.getByText('동선 수집·이용:').parentElement).toHaveTextContent('켜짐')
    expect(screen.getByText('상대에게 제공:').parentElement).toHaveTextContent('꺼짐')
  })

  it('"위치 수집 즉시 중단"이 ≤1탭으로 동작(제24조2, withdraw COLLECT_USE)', () => {
    render(<LocationControlCenter coupleId="c1" userId="u1" />)
    fireEvent.click(screen.getByRole('button', { name: '위치 수집 즉시 중단' }))
    expect(c.withdraw).toHaveBeenCalledWith('COLLECT_USE', expect.any(Object))
  })

  it('수집 OFF면 즉시 중단 버튼 숨김(대신 동의 관리로)', () => {
    c.canRecord = false
    render(<LocationControlCenter coupleId="c1" userId="u1" />)
    expect(screen.queryByRole('button', { name: '위치 수집 즉시 중단' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '동의 관리' })).toBeInTheDocument()
  })

  it('"동의 관리"가 동의 시트를 연다', () => {
    render(<LocationControlCenter coupleId="c1" userId="u1" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '동의 관리' }))
    expect(screen.getByRole('dialog', { name: '위치 동선 동의 관리' })).toBeInTheDocument()
  })
})
