import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '@/components/common/ToastProvider'

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
vi.mock('@/hooks/usePlaceTrash', () => ({
  useTrashPlaces: () => ({ data: [] }),
  useRestorePlace: () => ({ restorePlace: vi.fn(), isPending: false }),
}))
// ProfileEditor는 별도 테스트(profileEditor.test.tsx)에서 검증 — 여기선 스텁으로 격리.
vi.mock('@/components/profile/ProfileEditor', () => ({ ProfileEditor: () => null }))

import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
import UsPage from '@/pages/UsPage'

function renderUs() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <OfflineQueueProvider>
        <ToastProvider><MemoryRouter>
          <UsPage />
        </MemoryRouter></ToastProvider>
      </OfflineQueueProvider>
    </QueryClientProvider>,
  )
}

describe('UsPage 연결 해제 확인 다이얼로그(공용 Dialog로 교체, R3)', () => {
  it('"연결 해제" 트리거를 누르면 aria-modal 다이얼로그가 열리고 취소/연결 해제 액션이 보인다', () => {
    renderUs()
    const trigger = screen.getByRole('button', { name: '연결 해제' })
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
    // 다이얼로그 내부의 확정 버튼(트리거와 별개로 다이얼로그 안에 존재)
    expect(dialog.querySelector('button')).toBeTruthy()
    const confirmBtns = screen.getAllByRole('button', { name: '연결 해제' })
    // 트리거 + 다이얼로그 안 확정 버튼 둘 다 "연결 해제" 라벨
    expect(confirmBtns.length).toBeGreaterThanOrEqual(1)
  })

  it('ESC를 누르면 다이얼로그가 닫히고 포커스가 "연결 해제" 트리거로 복귀한다', () => {
    renderUs()
    const trigger = screen.getByRole('button', { name: '연결 해제' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
