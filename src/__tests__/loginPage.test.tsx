import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// useSignInWithOtp 모킹 — status/error/verifyCode/sendMagicLink를 테스트가 제어.
const otp = vi.hoisted(() => ({
  status: 'idle' as 'idle' | 'sending' | 'sent' | 'error',
  error: null as string | null,
  sendMagicLink: vi.fn(),
  verifyCode: vi.fn(),
  reset: vi.fn(),
}))
vi.mock('@/hooks/useSignInWithOtp', () => ({
  useSignInWithOtp: () => otp,
}))

// useResendCooldown 모킹 — remaining/canResend/start를 테스트가 제어.
const cooldown = vi.hoisted(() => ({
  remaining: 0,
  canResend: true,
  start: vi.fn(),
}))
vi.mock('@/hooks/useResendCooldown', () => ({
  useResendCooldown: () => cooldown,
}))

// 구글/비번 훅은 정적 모킹(클릭 경로만 확인).
const google = vi.hoisted(() => ({ signIn: vi.fn(), loading: false, error: null as string | null }))
vi.mock('@/hooks/useSignInWithGoogle', () => ({
  useSignInWithGoogle: () => google,
}))
vi.mock('@/hooks/useSignInWithPassword', () => ({
  useSignInWithPassword: () => ({ signIn: vi.fn(), status: 'idle', error: null }),
}))

// 로그인 화면은 비로그인 + configured 상태.
vi.mock('@/state/auth', () => ({
  useAuth: () => ({ initializing: false, session: null, configured: true }),
}))

import LoginPage from '@/pages/auth/LoginPage'

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  otp.status = 'idle'
  otp.error = null
  otp.sendMagicLink.mockReset()
  otp.verifyCode.mockReset().mockResolvedValue(true)
  otp.reset.mockReset()
  cooldown.remaining = 0
  cooldown.canResend = true
  cooldown.start.mockReset()
  google.signIn.mockReset()
  google.loading = false
  google.error = null
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('LoginPage — OAuth-first + 재전송 카운트다운 + OTP 입력 (R3 T15)', () => {
  it('구글 버튼이 이메일 폼보다 먼저(상단) 렌더된다 (OAuth 우선)', () => {
    renderLogin()
    const google = screen.getByRole('button', { name: /구글로 계속하기/ })
    const submit = screen.getByRole('button', { name: '로그인 링크 받기' })
    // DOM 순서: 구글 버튼이 이메일 제출 버튼보다 앞.
    expect(google.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('이메일 제출 성공(sent)이면 재전송 쿨다운을 30초로 시작한다', () => {
    otp.status = 'sent'
    renderLogin()
    expect(cooldown.start).toHaveBeenCalledWith(30)
  })

  it('sent 상태 + remaining>0이면 재전송 버튼은 비활성 + "다시 보내기 (NN초)"', () => {
    otp.status = 'sent'
    cooldown.remaining = 17
    cooldown.canResend = false
    renderLogin()
    const resend = screen.getByRole('button', { name: '다시 보내기 (17초)' })
    expect(resend).toBeDisabled()
  })

  it('sent 상태 + remaining===0이면 재전송 버튼 활성 + 클릭 시 sendMagicLink 재호출', () => {
    otp.status = 'sent'
    cooldown.remaining = 0
    cooldown.canResend = true
    renderLogin()
    const resend = screen.getByRole('button', { name: '다시 보내기' })
    expect(resend).not.toBeDisabled()
    fireEvent.click(resend)
    expect(otp.sendMagicLink).toHaveBeenCalled()
  })

  it('sent 상태에 6자리 코드 입력 + "코드로 로그인"이 verifyCode(email, code)를 호출한다', async () => {
    otp.status = 'sent'
    renderLogin()
    const codeInput = screen.getByLabelText('6자리 코드') as HTMLInputElement
    expect(codeInput).toHaveAttribute('inputmode', 'numeric')
    fireEvent.change(codeInput, { target: { value: '123456' } })
    const verifyBtn = screen.getByRole('button', { name: '코드로 로그인' })
    fireEvent.click(verifyBtn)
    await waitFor(() => expect(otp.verifyCode).toHaveBeenCalledWith(expect.any(String), '123456'))
  })

  it('sent 상태에 다른 브라우저 안내(같은 화면에 코드 입력) 카피가 보인다', () => {
    otp.status = 'sent'
    renderLogin()
    expect(
      screen.getByText(/다른 브라우저에서 열렸다면.*6자리 코드를 입력/),
    ).toBeInTheDocument()
  })
})
