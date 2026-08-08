import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// 프로필 사진 — 고르기/바꾸기/지우기 배선.
// 사진이 있을 때만 '지우기'가 있어야 하고, 지우기는 **현재 경로와 version**을 그대로 넘겨야 한다
// (경로가 빠지면 Storage에 고아 파일이 남고, version이 빠지면 LWW 덮어쓰기가 된다 §4.3).

const state = vi.hoisted(() => ({
  upload: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  toast: vi.fn(),
}))

vi.mock('@/hooks/useAvatarUpload', async (orig) => {
  const real = await orig<typeof import('@/hooks/useAvatarUpload')>()
  return {
    ...real, // avatarPath는 실제 구현 사용
    useAvatarUpload: () => ({
      upload: state.upload,
      remove: state.remove,
      isPending: false,
      error: null,
    }),
  }
})

vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ show: state.toast }) }))

import { AvatarPicker } from '@/components/profile/AvatarPicker'

function renderPicker(over: Partial<Parameters<typeof AvatarPicker>[0]> = {}) {
  return render(
    <AvatarPicker
      coupleId="c1"
      userId="u1"
      currentUrl={null}
      currentPath={null}
      displayName="민제"
      color="#3b6db5"
      version={7}
      {...over}
    />,
  )
}

beforeEach(() => {
  state.upload.mockClear()
  state.remove.mockClear()
  state.toast.mockClear()
})

describe('AvatarPicker — 빈 상태', () => {
  it('사진이 없으면 이니셜 폴백 + "사진 고르기", 지우기는 없다', () => {
    renderPicker()
    expect(screen.getByText('민')).toBeInTheDocument() // 이니셜(색만으로 구분 금지 §8)
    expect(screen.getByRole('button', { name: /사진 고르기/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지우기' })).not.toBeInTheDocument()
  })

  it('이름이 비어도 라벨이 사라지지 않는다', () => {
    renderPicker({ displayName: '   ' })
    expect(screen.getByText('나')).toBeInTheDocument()
  })
})

describe('AvatarPicker — 사진이 있을 때', () => {
  it('현재 사진을 보여주고 "사진 바꾸기" + "지우기"가 뜬다', () => {
    renderPicker({ currentUrl: 'https://signed/a.webp', currentPath: 'c1/avatars/u1-1.webp' })
    expect(screen.getByRole('img', { name: '현재 프로필 사진' })).toHaveAttribute(
      'src',
      'https://signed/a.webp',
    )
    expect(screen.getByRole('button', { name: /사진 바꾸기/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지우기' })).toBeInTheDocument()
  })

  it('지우기는 현재 경로와 version을 그대로 넘긴다(고아 파일·LWW 방지)', async () => {
    renderPicker({
      currentUrl: 'https://signed/a.webp',
      currentPath: 'c1/avatars/u1-1.webp',
      version: 12,
    })
    fireEvent.click(screen.getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(1))
    expect(state.remove).toHaveBeenCalledWith({
      expectedVersion: 12,
      previousPath: 'c1/avatars/u1-1.webp',
    })
  })

  it('지우기 실패는 인라인으로 말한다 — 삼키지 않는다', async () => {
    state.remove.mockRejectedValueOnce(new Error('프로필이 방금 다른 곳에서 바뀌었어요.'))
    renderPicker({ currentUrl: 'https://s/a.webp', currentPath: 'c1/avatars/u1-1.webp' })
    fireEvent.click(screen.getByRole('button', { name: '지우기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('프로필이 방금 다른 곳에서 바뀌었어요.')
  })
})

describe('AvatarPicker — 파일 입력', () => {
  it('파일 입력은 화면에서만 숨기고 접근성 트리에는 남는다', () => {
    renderPicker()
    const input = screen.getByLabelText('프로필 사진 파일 선택')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/*')
    // display:none이면 스크린리더에서도 사라진다 — 클래스로 시각적 숨김만 한다.
    expect(input.className).not.toBe('')
  })

  it('파일을 고르기 전에는 크롭 시트가 없다', () => {
    renderPicker()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
