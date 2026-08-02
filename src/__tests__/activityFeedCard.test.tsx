import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// 인앱 활동 피드 카드 — 웹푸시가 안 되는 자리를 메우는 1차 알림 수단(ux §6).
const state = vi.hoisted(() => ({ items: [] as unknown[] }))
vi.mock('@/hooks/useActivityFeed', () => ({ useActivityFeed: () => ({ data: state.items }) }))
vi.mock('@/hooks/useProfiles', () => ({
  useProfiles: () => ({
    data: {
      me: { id: 'me', displayName: '나', color: '#3b6db5', avatarUrl: null },
      you: { id: 'you', displayName: '지민', color: '#e58', avatarUrl: null },
    },
  }),
}))

import { ActivityFeed } from '@/components/common/ActivityFeed'

const item = (over: Record<string, unknown> = {}) => ({
  id: 'place:p1',
  kind: 'place',
  text: '‘칠성조선소’를 가고싶은 곳에 담았어요',
  createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
  actorId: 'you',
  ...over,
})

beforeEach(() => {
  state.items = []
})

describe('ActivityFeed 카드', () => {
  it('항목 0이면 카드 자체를 감춘다(죽은 카드 금지 — UpcomingFeed와 같은 규약)', () => {
    const { container } = render(<ActivityFeed coupleId="c1" myId="me" />)
    expect(container.firstChild).toBeNull()
  })

  it('상대 활동을 문장과 상대 시간으로 보여준다', () => {
    state.items = [item()]
    render(<ActivityFeed coupleId="c1" myId="me" />)
    expect(screen.getByText('‘칠성조선소’를 가고싶은 곳에 담았어요')).toBeInTheDocument()
    expect(screen.getByText('30분 전')).toBeInTheDocument()
  })

  it('누가 했는지 아바타로 출처를 남긴다(색만 의존하지 않게 이름이 라벨에)', () => {
    state.items = [item()]
    render(<ActivityFeed coupleId="c1" myId="me" />)
    expect(screen.getByLabelText('지민 활동')).toBeInTheDocument()
  })

  it('갱신을 스크린리더에 알린다(aria-live)', () => {
    state.items = [item()]
    render(<ActivityFeed coupleId="c1" myId="me" />)
    expect(screen.getByRole('list')).toHaveAttribute('aria-live', 'polite')
  })

  it('카드에 접근성 이름이 있다', () => {
    state.items = [item()]
    render(<ActivityFeed coupleId="c1" myId="me" />)
    expect(screen.getByLabelText('상대의 최근 활동')).toBeInTheDocument()
  })
})
