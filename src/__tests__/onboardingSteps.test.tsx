import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// 온보딩 ②색상 ③동의 위저드 — 의존 훅을 모킹하고 UI·상호작용 계약만 검증.
const { updateProfile, updateConsent, navigateSpy, state } = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updateConsent: vi.fn(),
  navigateSpy: vi.fn(),
  // 안정적 참조 — useMyProfile이 매 렌더 새 객체를 주면 시드 useEffect가 입력을 되돌린다.
  state: {
    myProfile: {
      id: 'u1',
      display_name: '민제',
      color: '#3b6db5',
      version: 4,
      location_consent_at: null as string | null,
      photo_consent_at: null as string | null,
    },
    myRole: 'user_a' as 'user_a' | 'user_b',
    profileLoading: false,
    consentLoading: false,
  },
}))

vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({ data: { coupleId: 'c1', status: 'ACTIVE', myRole: state.myRole }, isLoading: false }),
}))
vi.mock('@/hooks/useMyProfile', () => ({
  useMyProfile: () => ({ data: state.myProfile, isLoading: state.profileLoading }),
}))
vi.mock('@/hooks/useUpdateProfile', () => ({
  useUpdateProfile: () => ({ updateProfile, isPending: false, error: null }),
}))
vi.mock('@/hooks/useConsent', () => ({
  useConsent: () => ({ consentRecorded: false, isLoading: state.consentLoading }),
  useUpdateConsent: () => ({ updateConsent, isPending: false, error: null }),
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

import { OnboardingSteps } from '@/components/onboarding/OnboardingSteps'

function renderSteps() {
  return render(
    <MemoryRouter>
      <OnboardingSteps />
    </MemoryRouter>,
  )
}

describe('OnboardingSteps ②색상 ③상호동의 위저드 (R3 T8)', () => {
  beforeEach(() => {
    updateProfile.mockReset()
    updateProfile.mockResolvedValue(undefined)
    updateConsent.mockReset()
    updateConsent.mockResolvedValue(undefined)
    navigateSpy.mockReset()
    state.myProfile = {
      id: 'u1',
      display_name: '민제',
      color: '#3b6db5',
      version: 4,
      location_consent_at: null,
      photo_consent_at: null,
    }
    state.myRole = 'user_a'
    state.profileLoading = false
    state.consentLoading = false
  })

  it('②: 역할 기본색(user_a→블루)이 선택된 ColorPicker를 보여준다', () => {
    state.myRole = 'user_a'
    state.myProfile = { ...state.myProfile, color: '#3b6db5' }
    renderSteps()
    const blue = screen.getByRole('radio', { name: '블루' })
    expect(blue.getAttribute('aria-checked') === 'true' || blue.getAttribute('aria-pressed') === 'true').toBe(true)
  })

  it('②: user_b면 핑크가 기본 선택된다', () => {
    state.myRole = 'user_b'
    // 서버 행에 색이 아직 없으면 역할 기본색으로 시드.
    state.myProfile = { ...state.myProfile, color: '' }
    renderSteps()
    const pink = screen.getByRole('radio', { name: '핑크' })
    expect(pink.getAttribute('aria-checked') === 'true' || pink.getAttribute('aria-pressed') === 'true').toBe(true)
  })

  it('진행 표시기가 2/3로 시작한다', () => {
    renderSteps()
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('②에서 다음 → updateProfile({ color, expectedVersion }) 후 ③(동의)로 이동, 3/3 표시', async () => {
    renderSteps()
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ color: '#3b6db5', expectedVersion: 4 }),
    )
    expect(await screen.findByText('3/3')).toBeInTheDocument()
  })

  it('③: 위치·사진 동의 토글(라벨 텍스트 + 체크박스, 색만 아님)을 보여준다', async () => {
    renderSteps()
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    await screen.findByText('3/3')
    expect(screen.getByLabelText(/위치/)).toBeInTheDocument()
    expect(screen.getByLabelText(/사진/)).toBeInTheDocument()
  })

  it('③: 둘 다 체크해야 "시작하기"가 활성화된다', async () => {
    renderSteps()
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    await screen.findByText('3/3')
    const start = screen.getByRole('button', { name: '시작하기' })
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/위치/))
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/사진/))
    expect(start).not.toBeDisabled()
  })

  it('③ 확정 → updateConsent(두 시각 기록) 후 navigate("/", {replace:true})', async () => {
    renderSteps()
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    await screen.findByText('3/3')
    fireEvent.click(screen.getByLabelText(/위치/))
    fireEvent.click(screen.getByLabelText(/사진/))
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
    await waitFor(() => expect(updateConsent).toHaveBeenCalledTimes(1))
    expect(navigateSpy).toHaveBeenCalledWith('/', { replace: true })
  })

  it('프로필/동의 로딩 중에는 폴백을 보여준다(빈 화면 금지)', () => {
    state.profileLoading = true
    renderSteps()
    expect(screen.queryByRole('button', { name: /다음/ })).not.toBeInTheDocument()
  })
})
