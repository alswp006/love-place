import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '@/components/common/ToastProvider'

// 내보내기 헬퍼 모킹 — 게이트 흐름(내보냄 전 해제 불가)만 검증.
const { fetchCoupleExport, fetchPhotoBlobs, downloadJson, downloadBlob, buildExportZip, disconnectMutate } =
  vi.hoisted(() => ({
    fetchCoupleExport: vi.fn(),
    fetchPhotoBlobs: vi.fn(),
    downloadJson: vi.fn(),
    downloadBlob: vi.fn(),
    buildExportZip: vi.fn(),
    disconnectMutate: vi.fn(),
  }))

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
vi.mock('@/hooks/useCoupleInvite', () => ({
  useDisconnectCouple: () => ({ mutate: disconnectMutate, isPending: false }),
}))
vi.mock('@/hooks/usePlaceTrash', () => ({
  useTrashPlaces: () => ({ data: [] }),
  useRestorePlace: () => ({ restorePlace: vi.fn(), isPending: false }),
}))
vi.mock('@/components/profile/ProfileEditor', () => ({ ProfileEditor: () => null }))
vi.mock('@/lib/export/dumpSchema', () => ({
  fetchCoupleExport,
  fetchPhotoBlobs,
  downloadJson,
  downloadBlob,
}))
vi.mock('@/lib/export/buildZip', () => ({ buildExportZip }))

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

function openDialog() {
  // 연결 관리 카드의 트리거(다이얼로그 밖) — 첫 번째 "연결 해제" 버튼.
  fireEvent.click(screen.getAllByRole('button', { name: '연결 해제' })[0]!)
}

describe('UsPage 연결 해제 게이트 — 정직 카피 + 내보내기 필수', () => {
  beforeEach(() => {
    fetchCoupleExport.mockReset()
    fetchPhotoBlobs.mockReset()
    downloadJson.mockReset()
    downloadBlob.mockReset()
    buildExportZip.mockReset()
    disconnectMutate.mockReset()
    fetchCoupleExport.mockResolvedValue({
      version: 1,
      exportedAt: 'x',
      coupleId: 'c1',
      tables: { photos: [] },
    })
    fetchPhotoBlobs.mockResolvedValue([])
    buildExportZip.mockReturnValue(new Uint8Array([1]))
  })

  it('정직 카피 — 해제 후 공유 기록을 더는 볼 수 없고 내보낼 수 없음을 명시', () => {
    renderUs()
    openDialog()
    const dialog = screen.getByRole('dialog')
    const text = dialog.textContent ?? ''
    expect(text).toContain('해제하면')
    expect(text).toContain('더는')
    expect(text).toContain('내보낼 수')
  })

  it('내보내기 전에는 "연결 해제" 확정 버튼이 비활성이다', () => {
    renderUs()
    openDialog()
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: '연결 해제' })
    expect(confirm).toBeDisabled()
    // ack 체크박스도 내보내기 전에는 비활성
    const ack = within(dialog).getByRole('checkbox') as HTMLInputElement
    expect(ack).toBeDisabled()
  })

  it('다이얼로그 내 ZIP 내보내기 → ack 활성 → 체크하면 해제 활성, mutate 호출', async () => {
    renderUs()
    openDialog()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /지금 ZIP 내보내기/ }))
    const ack = within(dialog).getByRole('checkbox') as HTMLInputElement
    await waitFor(() => expect(ack).not.toBeDisabled())

    // 내보냈지만 ack 미체크 → 여전히 비활성
    expect(within(dialog).getByRole('button', { name: '연결 해제' })).toBeDisabled()

    fireEvent.click(ack)
    const confirm = within(dialog).getByRole('button', { name: '연결 해제' })
    await waitFor(() => expect(confirm).not.toBeDisabled())

    fireEvent.click(confirm)
    expect(disconnectMutate).toHaveBeenCalledWith('c1', expect.anything())
  })

  it('JSON-only 내보내기(카드의 "내 데이터 내보내기")로는 해제 게이트가 열리지 않는다 — ZIP 전용', async () => {
    renderUs()
    // 카드의 JSON 내보내기만 수행(ZIP 아님)
    fireEvent.click(screen.getByRole('button', { name: '내 데이터 내보내기' }))
    await waitFor(() => expect(downloadJson).toHaveBeenCalled())
    expect(downloadBlob).not.toHaveBeenCalled()

    // 그래도 해제 다이얼로그의 ack/확정 버튼은 여전히 비활성(zipExported=false)
    openDialog()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('checkbox')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '연결 해제' })).toBeDisabled()
  })

  it('ESC를 누르면 다이얼로그가 닫힌다', () => {
    renderUs()
    openDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
