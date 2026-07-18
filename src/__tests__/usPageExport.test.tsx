import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '@/components/common/ToastProvider'

// 내보내기 헬퍼(T10/T11) 모킹 — UsPage가 JSON·ZIP 경로를 올바로 엮는지(계약)만 검증.
const { fetchCoupleExport, fetchPhotoBlobs, downloadJson, downloadBlob, buildExportZip } = vi.hoisted(() => ({
  fetchCoupleExport: vi.fn(),
  fetchPhotoBlobs: vi.fn(),
  downloadJson: vi.fn(),
  downloadBlob: vi.fn(),
  buildExportZip: vi.fn(),
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
vi.mock('@/hooks/useCoupleInvite', () => ({ useDisconnectCouple: () => ({ mutate: () => {}, isPending: false }) }))
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

describe('UsPage 내보내기 — JSON + 사진 ZIP 실제 다운로드(§10.4 회수권)', () => {
  beforeEach(() => {
    fetchCoupleExport.mockReset()
    fetchPhotoBlobs.mockReset()
    downloadJson.mockReset()
    downloadBlob.mockReset()
    buildExportZip.mockReset()
    fetchCoupleExport.mockResolvedValue({
      version: 1,
      exportedAt: '2026-06-21T00:00:00.000Z',
      coupleId: 'c1',
      tables: { photos: [{ id: 'ph1', storage_url: 'c1/a.jpg' }] },
    })
    fetchPhotoBlobs.mockResolvedValue([{ name: 'photos/ph1.jpg', bytes: new Uint8Array([1, 2, 3]) }])
    buildExportZip.mockReturnValue(new Uint8Array([9, 9]))
  })

  it('JSON 내보내기 버튼은 fetchCoupleExport + downloadJson을 호출한다(기존 경로 유지)', async () => {
    renderUs()
    fireEvent.click(screen.getByRole('button', { name: '내 데이터 내보내기' }))
    await waitFor(() => expect(fetchCoupleExport).toHaveBeenCalledWith('c1'))
    expect(downloadJson).toHaveBeenCalledTimes(1)
  })

  it('ZIP 내보내기 버튼은 export→photoBlobs→buildZip→downloadBlob 파이프라인을 호출한다', async () => {
    renderUs()
    fireEvent.click(screen.getByRole('button', { name: /ZIP 내보내기/ }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    expect(fetchCoupleExport).toHaveBeenCalledWith('c1')
    expect(fetchPhotoBlobs).toHaveBeenCalledWith('c1', [{ id: 'ph1', storage_url: 'c1/a.jpg' }])
    expect(buildExportZip).toHaveBeenCalledTimes(1)
    const [filename, bytes] = downloadBlob.mock.calls[0]!
    expect(filename).toMatch(/\.zip$/)
    expect(bytes).toBeInstanceOf(Uint8Array)
  })

  it('ZIP 내보내기 중 spinner(내보내는 중…) → 완료 후 사라짐', async () => {
    let resolveExport: (v: unknown) => void = () => {}
    fetchCoupleExport.mockReturnValue(new Promise((r) => { resolveExport = r }))
    renderUs()
    fireEvent.click(screen.getByRole('button', { name: /ZIP 내보내기/ }))
    // 내보내는 중에는 ZIP 버튼 라벨이 spinner 텍스트로 바뀐다(JSON 버튼도 동시에 비활성).
    await waitFor(() => expect(screen.getAllByText('내보내는 중…').length).toBeGreaterThan(0))
    resolveExport({
      version: 1,
      exportedAt: 'x',
      coupleId: 'c1',
      tables: { photos: [] },
    })
    await waitFor(() => expect(screen.queryByText('내보내는 중…')).toBeNull())
  })

  it('ZIP 내보내기 실패 시 에러 메시지를 보여준다', async () => {
    fetchCoupleExport.mockRejectedValue(new Error('네트워크 오류'))
    renderUs()
    fireEvent.click(screen.getByRole('button', { name: /ZIP 내보내기/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('네트워크 오류'))
  })
})
