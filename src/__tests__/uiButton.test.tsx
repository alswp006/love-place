import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import styles from '@/components/ui/Button.module.css'

// 공용 Button 프리미티브(마시멜로 R2) — variant별 클래스/요소, link 렌더, disabled, onClick.
// CSS module 클래스명은 빌드에서 해시되므로 동일 모듈을 import해 해시된 값으로 단언한다.
// vite/client 타입상 styles[x]는 string|undefined → 존재를 단언하는 헬퍼로 좁힌다.
function cls(name: keyof typeof styles): string {
  const c = styles[name]
  if (!c) throw new Error(`Button.module.css에 .${String(name)} 클래스가 없음`)
  return c
}

describe('Button 프리미티브(variant · link · disabled · onClick, R2)', () => {
  it('기본 variant=primary로 <button>을 렌더하고 primary 클래스를 가진다', () => {
    render(<Button>저장</Button>)
    const btn = screen.getByRole('button', { name: '저장' })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveClass(cls('base'))
    expect(btn).toHaveClass(cls('primary'))
  })

  it.each([
    ['primary', 'primary'],
    ['cta', 'cta'],
    ['ghost', 'ghost'],
    ['danger', 'danger'],
  ] as const)('variant=%s → %s 클래스를 가진다', (variant, expected) => {
    render(<Button variant={variant}>라벨</Button>)
    const btn = screen.getByRole('button', { name: '라벨' })
    expect(btn).toHaveClass(cls('base'))
    expect(btn).toHaveClass(cls(expected))
  })

  it('as="link" → react-router Link(a[href])로 렌더하고 to를 href로 반영', () => {
    render(
      <MemoryRouter>
        <Button as="link" to="/places" variant="cta">
          장소로
        </Button>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: '장소로' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/places')
    expect(link).toHaveClass(cls('base'))
    expect(link).toHaveClass(cls('cta'))
  })

  it('type prop을 button에 전달(기본은 button 타입)', () => {
    render(<Button type="submit">제출</Button>)
    expect(screen.getByRole('button', { name: '제출' })).toHaveAttribute('type', 'submit')
  })

  it('type 미지정 시 type="button"(폼 우발 제출 방지)', () => {
    render(<Button>버튼</Button>)
    expect(screen.getByRole('button', { name: '버튼' })).toHaveAttribute('type', 'button')
  })

  it('onClick 클릭 시 호출된다', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>클릭</Button>)
    fireEvent.click(screen.getByRole('button', { name: '클릭' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled면 onClick이 호출되지 않고 disabled 속성을 가진다', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        비활성
      </Button>,
    )
    const btn = screen.getByRole('button', { name: '비활성' })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disabled link → aria-disabled + tabindex=-1로 비활성, to href 미반영', () => {
    render(
      <MemoryRouter>
        <Button as="link" to="/discover" disabled>
          추천으로
        </Button>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: '추천으로' })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')
    expect(link).not.toHaveAttribute('href')
  })

  it('className을 병합한다(base/variant + 사용자 클래스)', () => {
    render(
      <Button className="extra" variant="ghost">
        고스트
      </Button>,
    )
    const btn = screen.getByRole('button', { name: '고스트' })
    expect(btn).toHaveClass(cls('base'))
    expect(btn).toHaveClass(cls('ghost'))
    expect(btn).toHaveClass('extra')
  })

  it('그 외 button 속성을 전달한다(aria-label 등)', () => {
    render(
      <Button aria-label="좋아요">
        <span aria-hidden="true">♥</span>
      </Button>,
    )
    expect(screen.getByRole('button', { name: '좋아요' })).toBeInTheDocument()
  })
})
