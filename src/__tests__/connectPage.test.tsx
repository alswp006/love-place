import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// --- 모킹: 인증/커플 상태/초대 훅/라우터 네비게이트 ---
type CoupleStub = {
  coupleId: string | null
  status: 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | null
  partner: { id: string } | null
  isSolo: boolean
  inviteCode: string | null
}
let coupleData: CoupleStub = {
  coupleId: null,
  status: null,
  partner: null,
  isSolo: false,
  inviteCode: null,
}

vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } }, configured: true, initializing: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({ data: coupleData, isLoading: false }),
}))

// create_invite / accept_invite mutate를 테스트가 제어할 수 있게 스파이로 노출.
const createMutate = vi.fn()
const acceptMutate = vi.fn()
let createPending = false

vi.mock('@/hooks/useCoupleInvite', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useCoupleInvite')>('@/hooks/useCoupleInvite')
  return {
    ...actual,
    useCreateInvite: () => ({ mutate: createMutate, isPending: createPending }),
    useAcceptInvite: () => ({ mutate: acceptMutate, isPending: false }),
  }
})

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

import { ToastProvider } from '@/components/common/ToastProvider'
import { inviteShareText } from '@/lib/inviteCode'
import ConnectPage from '@/pages/ConnectPage'

function renderConnect() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <ConnectPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('ConnectPage 재수화/토스트/자동추출/에러분리 (R3 T4)', () => {
  beforeEach(() => {
    coupleData = { coupleId: 'c1', status: 'ACTIVE', partner: null, isSolo: true, inviteCode: null }
    createMutate.mockReset()
    acceptMutate.mockReset()
    createPending = false
    navigateSpy.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ⚠️ 계약 변경(0024): 예전엔 PENDING이면 **마운트 시 create_invite를 자동 호출**했다.
  // 연결이 관문이던 시절엔 그 화면에 온 것 자체가 "코드를 만들겠다"는 뜻이었기 때문이다.
  // 이제는 우리 탭에서 구경하러 들를 수도 있으므로, 화면을 여는 것만으로 코드가 발급되면 안 된다.
  // 이미 있는 코드는 useCouple이 조회해 주고, 없으면 사용자가 버튼을 눌러야 만들어진다.
  it('(a) 이미 발급된 코드가 있으면 새로 만들지 않고 그대로 보여준다', async () => {
    coupleData = { ...coupleData, inviteCode: 'ABCD2345' }
    renderConnect()
    expect(await screen.findByText('ABCD-2345')).toBeInTheDocument()
    expect(createMutate).not.toHaveBeenCalled()
  })

  it('(a2) 코드가 없으면 화면을 여는 것만으로 발급되지 않는다(부작용 금지)', () => {
    renderConnect()
    expect(createMutate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '초대 코드 만들기' })).toBeInTheDocument()
  })

  it('(a3) 혼자면 되돌아갈 길이 있다 — 연결은 선택이지 통과 조건이 아니다', () => {
    renderConnect()
    fireEvent.click(screen.getByRole('button', { name: '나중에 할게요' }))
    expect(navigateSpy).toHaveBeenCalledWith('/')
  })

  it('(b) 앱 공유 문구(inviteShareText) 전체를 붙여넣으면 ABCD-2345로 자동 채움 + 자동 제출(accept 호출)', async () => {
    renderConnect()
    const input = screen.getByLabelText('초대 코드 입력') as HTMLInputElement
    // 가장 흔한 입력원: User A가 앱의 '카톡·메시지로 공유하기'로 보낸 문구 그대로를 붙여넣는다.
    //   inviteShareText('ABCD2345')에는 'love place' 브랜딩이 들어가지만,
    //   extractInviteCode가 '초대코드' 라벨 뒤를 우선 탐색하므로 실제 코드 ABCD2345를 정확히 추출해야 한다.
    fireEvent.change(input, {
      target: { value: inviteShareText('ABCD2345') },
    })
    await waitFor(() => expect(input.value).toBe('ABCD-2345'))
    expect(acceptMutate).toHaveBeenCalledWith('ABCD2345', expect.anything())
    const connectBtn = screen.getByRole('button', { name: '연결하기' })
    expect(connectBtn).not.toBeDisabled()
  })

  it('(c) create_invite 실패(ALREADY_COUPLED)는 만들기 섹션에 표시되고 입력 섹션에는 없다', async () => {
    createMutate.mockImplementation(
      (_vars: undefined, opts?: { onSuccess?: (r: { ok: false; reason: string }) => void }) => {
        opts?.onSuccess?.({ ok: false, reason: 'ALREADY_COUPLED' })
      },
    )
    renderConnect()
    fireEvent.click(screen.getByRole('button', { name: '초대 코드 만들기' }))

    const msg = '이미 연결된 상대가 있어요. 새로 연결하려면 [우리]에서 먼저 연결을 해제해 주세요.'
    const createErr = await screen.findByText(msg)
    expect(createErr).toBeInTheDocument()
    // 만들기 섹션(① ...) 안에 있어야 한다.
    expect(createErr.closest('section')).toHaveAttribute('aria-label', '내 초대 코드')
    // 입력 섹션에는 같은 메시지가 없다.
    const acceptSection = screen.getByRole('region', { name: '상대 코드 입력' })
    expect(acceptSection.textContent ?? '').not.toContain(msg)
  })

  it('(d) navigator.share 미지원이면 alert가 아니라 toast.show로 안내한다', async () => {
    coupleData = { ...coupleData, inviteCode: 'ABCD2345' }
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const writeText = vi.fn().mockResolvedValue(undefined)
    // navigator.share 미지원 + clipboard.writeText 제공.
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    renderConnect()
    const shareBtn = await screen.findByRole('button', { name: '카톡·메시지로 공유하기' })
    fireEvent.click(shareBtn)

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(alertSpy).not.toHaveBeenCalled()
    expect(await screen.findByText('초대 문구를 복사했어요. 상대에게 붙여넣어 보내주세요.')).toBeInTheDocument()
  })
})
