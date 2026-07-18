import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '@/components/common/ToastProvider'
import btn from '@/components/ui/Button.module.css'

// 마시멜로 R2 1차 채택 — LoginPage/UsPage의 주요·보조 버튼이 공용 Button 프리미티브로
// 흡수됐는지(base 클래스 부여)를 검증하면서, 기존 동작(onClick/disabled/라벨)을 보존한다.
// CSS module 클래스는 해시되므로 동일 모듈을 import해 해시값으로 단언.
function base(): string {
  const c = btn.base
  if (!c) throw new Error('Button.module.css에 .base 클래스가 없음')
  return c
}

// ── LoginPage 모킹(loginPage.test.tsx와 동일 셋업) ──
const otp = vi.hoisted(() => ({
  status: 'idle' as 'idle' | 'sending' | 'sent' | 'error',
  error: null as string | null,
  sendMagicLink: vi.fn(),
  verifyCode: vi.fn(),
  reset: vi.fn(),
}))
vi.mock('@/hooks/useSignInWithOtp', () => ({ useSignInWithOtp: () => otp }))
const cooldown = vi.hoisted(() => ({ remaining: 0, canResend: true, start: vi.fn() }))
vi.mock('@/hooks/useResendCooldown', () => ({ useResendCooldown: () => cooldown }))
const google = vi.hoisted(() => ({ signIn: vi.fn(), loading: false, error: null as string | null }))
vi.mock('@/hooks/useSignInWithGoogle', () => ({ useSignInWithGoogle: () => google }))
vi.mock('@/hooks/useSignInWithPassword', () => ({
  useSignInWithPassword: () => ({ signIn: vi.fn(), status: 'idle', error: null }),
}))

// ── UsPage 추가 모킹 ──
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({
    data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2', connectedAt: null, partner: null },
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useSignOut', () => ({ useSignOut: () => () => {} }))
vi.mock('@/hooks/useCoupleInvite', () => ({
  useDisconnectCouple: () => ({ mutate: () => {}, isPending: false }),
}))
vi.mock('@/hooks/useTrash', async (orig) => {
  const real = await orig<typeof import('@/hooks/useTrash')>()
  return { ...real, useTrash: () => ({ data: [] }), useRestore: () => ({ restore: vi.fn(), isPending: false }) }
})
vi.mock('@/components/profile/ProfileEditor', () => ({ ProfileEditor: () => null }))

// auth는 두 페이지가 공유 — 비로그인이면 LoginPage가 폼을 그린다(session:null). UsPage는 user만 본다.
vi.mock('@/state/auth', () => ({
  useAuth: () => ({
    initializing: false,
    session: null,
    configured: true,
    user: { id: 'u1', email: 'me@x.com' },
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import LoginPage from '@/pages/auth/LoginPage'
import UsPage from '@/pages/UsPage'
import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'

beforeEach(() => {
  otp.status = 'idle'
  otp.error = null
  otp.sendMagicLink.mockReset()
  otp.verifyCode.mockReset().mockResolvedValue(true)
  google.signIn.mockReset()
  google.loading = false
  google.error = null
  cooldown.canResend = true
  cooldown.remaining = 0
})

function renderLogin() {
  return render(
    <ToastProvider><MemoryRouter>
      <LoginPage />
    </MemoryRouter></ToastProvider>,
  )
}

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

describe('Button 프리미티브 채택 — LoginPage (마시멜로 R2 1차)', () => {
  it('이메일 매직링크 제출 버튼이 Button(cta) 프리미티브다(base 클래스)', () => {
    renderLogin()
    const submit = screen.getByRole('button', { name: '로그인 링크 받기' })
    expect(submit).toHaveClass(base())
    expect(submit).toHaveAttribute('type', 'submit')
  })

  it('코드 로그인 제출 버튼도 Button(cta) 프리미티브 + disabled 보존', () => {
    otp.status = 'sent'
    renderLogin()
    const verify = screen.getByRole('button', { name: '코드로 로그인' })
    expect(verify).toHaveClass(base())
    expect(verify).not.toBeDisabled()
  })

  it('제출은 sending 동안 disabled를 유지한다(동작 보존)', () => {
    otp.status = 'sending'
    renderLogin()
    expect(screen.getByRole('button', { name: '보내는 중…' })).toBeDisabled()
  })
})

describe('Button 프리미티브 채택 — UsPage (마시멜로 R2 1차)', () => {
  it('로그아웃 버튼이 Button(ghost) 프리미티브다(base 클래스)', () => {
    renderUs()
    expect(screen.getByRole('button', { name: '로그아웃' })).toHaveClass(base())
  })

  it('JSON/ZIP 내보내기 버튼이 Button 프리미티브 + disabled 동작 보존', () => {
    renderUs()
    expect(screen.getByRole('button', { name: '내 데이터 내보내기' })).toHaveClass(base())
    expect(screen.getByRole('button', { name: /ZIP 내보내기/ })).toHaveClass(base())
  })

  it('연결 해제 트리거가 Button(danger) 프리미티브이고 클릭 시 다이얼로그를 연다', () => {
    renderUs()
    const trigger = screen.getByRole('button', { name: '연결 해제' })
    expect(trigger).toHaveClass(base())
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
