import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } }, configured: true, initializing: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({
    data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2', connectedAt: null, partner: null },
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useSignOut', () => ({ useSignOut: () => () => {} }))
vi.mock('@/hooks/useCoupleInvite', () => ({ useDisconnectCouple: () => ({ mutate: () => {}, isPending: false }) }))
// 통합 휴지통(R3 T17) — kind별 useTrash를 합산. places만 한 건, 나머지는 빈 결과로 스텁.
vi.mock('@/hooks/useTrash', async (orig) => {
  const real = await orig<typeof import('@/hooks/useTrash')>()
  return {
    ...real,
    useTrash: (kind: string) => ({
      data:
        kind === 'places'
          ? [{ id: 't1', label: '삭제한 카페', kind: 'places', deleted_at: '2026-06-01T00:00:00Z', version: 1 }]
          : [],
    }),
    useRestore: () => ({ restore: vi.fn(), isPending: false }),
  }
})
// ProfileEditor는 별도 테스트(profileEditor.test.tsx)에서 검증 — 여기선 스텁으로 격리.
vi.mock('@/components/profile/ProfileEditor', () => ({ ProfileEditor: () => null }))

import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
import UsPage from '@/pages/UsPage'

function renderUs() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <OfflineQueueProvider>
        <MemoryRouter>
          <UsPage />
        </MemoryRouter>
      </OfflineQueueProvider>
    </QueryClientProvider>,
  )
}

describe('UsPage 통합 휴지통 섹션(R3 T17 — 전 엔티티)', () => {
  it('휴지통 토글을 열면 삭제된 항목과 복구 버튼이 보인다', () => {
    renderUs()
    const toggle = screen.getByRole('button', { name: /휴지통/ })
    fireEvent.click(toggle)
    expect(screen.getByText('삭제한 카페')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '복구' })).toBeInTheDocument()
  })
})
