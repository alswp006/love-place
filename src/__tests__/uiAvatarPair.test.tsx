import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvatarPair } from '@/components/ui/AvatarPair'
import styles from '@/components/ui/AvatarPair.module.css'

// AvatarPair 시그니처 프리미티브(마시멜로 R2) — 겹친 2인 아바타 + caption 슬롯.
// SourceAvatar(단일) 위에 빌드. 아바타페어 4색 배경 + 각 ink 텍스트. 색만 의존 금지(이니셜/이미지 + aria-label 병기).
// CSS module 클래스명은 동일 모듈을 import해 단언한다(uiChip/uiButton 테스트와 동일 패턴).
function cls(name: keyof typeof styles): string {
  const c = styles[name]
  if (!c) throw new Error(`AvatarPair.module.css에 .${String(name)} 클래스가 없음`)
  return c
}

describe('AvatarPair 프리미티브(2인 겹침 · caption · 단일 폴백, R2)', () => {
  it('2명을 렌더하고 두 번째 아바타에 overlap 클래스를 준다', () => {
    render(
      <AvatarPair
        people={[
          { name: '민제', initial: '민' },
          { name: '여친', initial: '여' },
        ]}
      />,
    )
    const first = screen.getByLabelText('민제')
    const second = screen.getByLabelText('여친')
    expect(first).toBeInTheDocument()
    expect(second).toBeInTheDocument()
    // 첫 아바타는 겹침 없음, 둘째 아바타만 overlap(margin-left:-8px) 클래스.
    expect(first).not.toHaveClass(cls('overlap'))
    expect(second).toHaveClass(cls('overlap'))
  })

  it('각 아바타는 aria-label로 이름을 안내한다(색만 의존 금지)', () => {
    render(
      <AvatarPair
        people={[
          { name: '민제', initial: '민' },
          { name: '여친', initial: '여' },
        ]}
      />,
    )
    expect(screen.getByLabelText('민제')).toHaveTextContent('민')
    expect(screen.getByLabelText('여친')).toHaveTextContent('여')
  })

  it('caption을 표시한다("둘 다 저장함" 슬롯)', () => {
    render(
      <AvatarPair
        people={[
          { name: '민제', initial: '민' },
          { name: '여친', initial: '여' },
        ]}
        caption="둘 다 저장함"
      />,
    )
    expect(screen.getByText('둘 다 저장함')).toBeInTheDocument()
  })

  it('caption이 없으면 caption 노드를 렌더하지 않는다', () => {
    const { container } = render(
      <AvatarPair
        people={[
          { name: '민제', initial: '민' },
          { name: '여친', initial: '여' },
        ]}
      />,
    )
    expect(container.querySelector(`.${cls('caption')}`)).toBeNull()
  })

  it('1명이면 단일 아바타로 폴백한다(겹침 없음)', () => {
    const { container } = render(<AvatarPair people={[{ name: '민제', initial: '민' }]} />)
    // 아바타 클래스를 가진 노드는 정확히 1개(겹침 없음).
    const avatars = container.querySelectorAll(`.${cls('avatar')}`)
    expect(avatars).toHaveLength(1)
    const only = avatars[0] as HTMLElement
    expect(only).toHaveTextContent('민')
    expect(only).not.toHaveClass(cls('overlap'))
  })

  it('color prop이 없으면 index로 아바타페어 4색을 순환한다(클래스로 이중화)', () => {
    render(
      <AvatarPair
        people={[
          { name: 'A', initial: 'A' },
          { name: 'B', initial: 'B' },
        ]}
      />,
    )
    // 두 아바타 모두 base 아바타 클래스를 가진다.
    expect(screen.getByLabelText('A')).toHaveClass(cls('avatar'))
    expect(screen.getByLabelText('B')).toHaveClass(cls('avatar'))
  })

  it('컨테이너는 role과 aria-label을 가진다(둘만의 출처 그룹)', () => {
    render(
      <AvatarPair
        people={[
          { name: '민제', initial: '민' },
          { name: '여친', initial: '여' },
        ]}
        caption="둘 다 저장함"
      />,
    )
    expect(screen.getByRole('group', { name: /둘 다 저장함/ })).toBeInTheDocument()
  })

  it('avatarUrl이 있으면 이미지를 렌더한다(이니셜 대신)', () => {
    render(
      <AvatarPair
        people={[
          { name: '민제', initial: '민', avatarUrl: 'https://example.com/a.png' },
          { name: '여친', initial: '여' },
        ]}
      />,
    )
    const img = screen.getByLabelText('민제').querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png')
  })
})
