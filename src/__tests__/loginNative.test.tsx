import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/platform', () => ({ isNativePlatform: () => true, getPlatformName: () => 'ios' }))
vi.mock('@/state/auth', () => ({
  useAuth: () => ({ initializing: false, session: null, configured: true }),
}))
// OTP 훅을 'sent' 상태로 고정해 코드 입력 화면을 단언한다.
vi.mock('@/hooks/useSignInWithOtp', () => ({
  useSignInWithOtp: () => ({
    status: 'sent',
    error: null,
    sendMagicLink: vi.fn(),
    verifyCode: vi.fn(),
    reset: vi.fn(),
  }),
}))
vi.mock('@/hooks/useSignInWithGoogle', () => ({
  useSignInWithGoogle: () => ({ signIn: vi.fn(), loading: false, error: null }),
}))
vi.mock('@/hooks/useSignInWithPassword', () => ({
  useSignInWithPassword: () => ({ signIn: vi.fn(), status: 'idle', error: null }),
}))
vi.mock('@/hooks/useResendCooldown', () => ({
  useResendCooldown: () => ({ start: vi.fn(), canResend: true, remaining: 0 }),
}))

import LoginPage from '@/pages/auth/LoginPage'

describe('LoginPage — 네이티브 OTP 우선', () => {
  it('네이티브 sent 화면은 6자리 코드 입력을 1차 안내로 노출한다', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('6자리 코드')).toBeInTheDocument()
    // 네이티브에선 "메일 링크를 누르면 로그인" 강조 대신 코드 안내가 제목이어야 한다.
    expect(screen.getByText('🔑 코드를 입력하세요')).toBeInTheDocument()
    // 웹 전용 "메일의 링크를 누르면 로그인됩니다" 안내는 네이티브에선 없어야 한다.
    expect(screen.queryByText(/링크를 누르면 로그인/)).toBeNull()
  })
})
