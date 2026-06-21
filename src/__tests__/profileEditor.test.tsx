import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// useUpdateProfile / useMyProfile / useCouple / useToast 모킹 — 에디터의 UI·상호작용 계약만 검증.
const { updateProfile, showToast, myProfile } = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  showToast: vi.fn(),
  // 안정적 참조 — useMyProfile이 매 렌더 새 객체를 주면 시드 useEffect가 입력을 되돌려버린다.
  myProfile: {
    id: 'u1',
    display_name: '민제',
    color: '#6e5aa8',
    version: 4,
    location_consent_at: null,
    photo_consent_at: null,
  },
}))

vi.mock('@/hooks/useUpdateProfile', () => ({
  useUpdateProfile: () => ({ updateProfile, isPending: false, error: null }),
}))
vi.mock('@/hooks/useMyProfile', () => ({
  useMyProfile: () => ({ data: myProfile, isLoading: false }),
}))
// 색 기본값은 역할(myRole)에서 도출 — 에디터가 useCouple로 내 역할을 읽는다(동의 단계 제거 후 대비 기본색).
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({ data: { coupleId: 'c1', status: 'ACTIVE', myRole: 'user_a' }, isLoading: false }),
}))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ show: showToast }) }))

import { ProfileEditor } from '@/components/profile/ProfileEditor'
import { PROFILE_PALETTE } from '@/lib/profileColor'

describe('ProfileEditor (이름·색 편집, 색+라벨 이중화)', () => {
  beforeEach(() => {
    updateProfile.mockReset()
    updateProfile.mockResolvedValue(undefined)
    showToast.mockReset()
  })

  it('이름 입력과 색 스와치 그리드를 렌더한다(각 스와치에 label aria-label)', () => {
    render(<ProfileEditor coupleId="c1" />)
    expect(screen.getByLabelText(/이름|표시/)).toBeInTheDocument()
    for (const entry of PROFILE_PALETTE) {
      expect(screen.getByRole('radio', { name: entry.label })).toBeInTheDocument()
    }
  })

  it('현재 색 스와치는 aria-pressed/aria-checked로 선택 표시된다', () => {
    render(<ProfileEditor coupleId="c1" />)
    const lavender = PROFILE_PALETTE.find((e) => e.hex === '#6e5aa8')!
    const swatch = screen.getByRole('radio', { name: lavender.label })
    expect(swatch.getAttribute('aria-checked') === 'true' || swatch.getAttribute('aria-pressed') === 'true').toBe(true)
  })

  it('색 선택 + 이름 수정 + 저장 → updateProfile({ display_name, color, expectedVersion })', async () => {
    render(<ProfileEditor coupleId="c1" />)
    const pink = PROFILE_PALETTE.find((e) => e.hex === '#b85a78')!
    fireEvent.click(screen.getByRole('radio', { name: pink.label }))

    const input = screen.getByLabelText(/이름|표시/)
    fireEvent.change(input, { target: { value: '하늘' } })

    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    expect(updateProfile).toHaveBeenCalledWith({
      display_name: '하늘',
      color: '#b85a78',
      expectedVersion: 4,
    })
  })

  it('저장 성공 시 토스트를 보여준다', async () => {
    render(<ProfileEditor coupleId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(showToast).toHaveBeenCalled())
  })
})
