import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// 내 동선 열람 통보(위치정보법 제19조). 로깅·도출·테스트는 이미 있었는데 렌더처가 0곳이었다 —
// docs/legal/location-policy.md가 이용자에게 "앱 내 활동 피드로 통지"를 약속한 부분.
const state = vi.hoisted(() => ({ items: [] as unknown[], isLoading: false }))
vi.mock('@/hooks/useLocationProvideFeed', () => ({
  useLocationProvideFeed: () => ({ items: state.items, isLoading: state.isLoading }),
}))

import { ProvideFeed } from '@/components/journey/ProvideFeed'

const item = (id: string, detail: string) => ({
  id,
  kind: 'provide' as const,
  label: '상대가 내 여행 동선을 열람했어요',
  detail,
  at: '2026-07-22T00:00:00.000Z',
})

beforeEach(() => {
  state.items = []
  state.isLoading = false
})

function renderFeed() {
  return render(<ProvideFeed coupleId="c1" userId="u1" notifyMode="IMMEDIATE" />)
}

describe('ProvideFeed', () => {
  it('열람 기록을 화면에 보여준다', () => {
    state.items = [item('l1', '3일 전')]
    renderFeed()
    expect(screen.getByText('상대가 내 여행 동선을 열람했어요')).toBeInTheDocument()
    expect(screen.getByText('3일 전')).toBeInTheDocument()
  })

  it('기록이 없으면 안심되는 빈 상태(죽은 화면 금지 §7)', () => {
    renderFeed()
    expect(screen.getByText(/열람한 기록이 없어요/)).toBeInTheDocument()
  })

  it('로딩은 스켈레톤', () => {
    state.isLoading = true
    renderFeed()
    expect(screen.getByLabelText('열람 내역 불러오는 중')).toBeInTheDocument()
  })

  it('섹션에 접근성 이름이 있고, 갱신을 스크린리더에 알린다', () => {
    state.items = [item('l1', '오늘')]
    renderFeed()
    expect(screen.getByLabelText('내 동선 열람 내역')).toBeInTheDocument()
    expect(screen.getByRole('list')).toHaveAttribute('aria-live', 'polite')
  })
})
