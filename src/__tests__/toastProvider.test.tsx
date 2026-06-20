import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider, useToast } from '@/components/common/ToastProvider'

// 컨텍스트 기반 토스트 — 자식 어디서든 useToast().show(...)로 호출하면 앱 레벨 포털 뷰포트에 뜬다.
// (페이지별 <Toast> 마운트 폐지 — Task 11/12.)
function Caller({ onApi }: { onApi: (api: ReturnType<typeof useToast>) => void }) {
  const api = useToast()
  onApi(api)
  return null
}

function renderWithApi() {
  let api!: ReturnType<typeof useToast>
  render(
    <ToastProvider>
      <Caller onApi={(a) => { api = a }} />
    </ToastProvider>,
  )
  return api
}

describe('ToastProvider (컨텍스트 · 포털 · 큐 · 액션, R1.5)', () => {
  it('show(문자열) → role=status 영역에 메시지가 뜬다', () => {
    const api = renderWithApi()
    act(() => api.show('저장했어요'))
    expect(screen.getByRole('status')).toHaveTextContent('저장했어요')
  })

  it('show({message, action}) → 액션 버튼(aria-label·텍스트)이 뜨고 클릭하면 onClick 호출', () => {
    const spy = vi.fn()
    const api = renderWithApi()
    act(() => api.show({ message: '삭제했어요', action: { label: '실행취소', onClick: spy } }))
    const btn = screen.getByRole('button', { name: '실행취소' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('두 번 show하면 둘 다 쌓여 보이고 자동으로 사라진다(큐 · 자동 해제)', async () => {
    const api = renderWithApi()
    act(() => {
      api.show('첫번째', 20)
      api.show('두번째', 20)
    })
    expect(screen.getByText('첫번째')).toBeInTheDocument()
    expect(screen.getByText('두번째')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('첫번째')).toBeNull()
      expect(screen.queryByText('두번째')).toBeNull()
    })
  })

  it('useToast를 Provider 밖에서 쓰면 throw', () => {
    const Bare = () => {
      useToast()
      return null
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })
})
