import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LikeButton } from '@/components/ui/LikeButton'
import styles from '@/components/ui/LikeButton.module.css'

// 공용 LikeButton 프리미티브(마시멜로 R2) — reactions 1:1 ❤️ 좋아요 토글.
// CSS module 클래스명은 빌드에서 해시되므로 동일 모듈을 import해 해시된 값으로 단언한다(Button/Chip 테스트와 동일 패턴).
// vite/client 타입상 styles[x]는 string|undefined → 존재를 단언하는 헬퍼로 좁힌다.
function cls(name: keyof typeof styles): string {
  const c = styles[name]
  if (!c) throw new Error(`LikeButton.module.css에 .${String(name)} 클래스가 없음`)
  return c
}

describe('LikeButton 프리미티브(liked · count · onToggle, R2)', () => {
  it('<button>으로 렌더하고 base 클래스를 가진다', () => {
    render(<LikeButton liked={false} count={0} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveClass(cls('base'))
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('liked=false → aria-pressed=false + 빈 하트(🤍) 글리프', () => {
    render(<LikeButton liked={false} count={2} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveTextContent('🤍')
    expect(btn).not.toHaveTextContent('❤️')
  })

  it('liked=true → aria-pressed=true + 채운 하트(❤️) 글리프', () => {
    render(<LikeButton liked count={3} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveTextContent('❤️')
    expect(btn).not.toHaveTextContent('🤍')
    expect(btn).toHaveClass(cls('liked'))
  })

  it('count를 표시한다', () => {
    render(<LikeButton liked count={7} onToggle={() => {}} />)
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('count 텍스트에 aria-hidden(라벨이 카운트를 포함하므로 중복 낭독 방지)', () => {
    render(<LikeButton liked count={5} onToggle={() => {}} />)
    expect(screen.getByText('5')).toHaveAttribute('aria-hidden', 'true')
  })

  it('하트 글리프는 aria-hidden(색·형태는 장식, 의미는 aria-label이 전달)', () => {
    render(<LikeButton liked count={1} onToggle={() => {}} />)
    expect(screen.getByText('❤️')).toHaveAttribute('aria-hidden', 'true')
  })

  it('aria-label에 좋아요 개수를 텍스트로 병기한다(색만 의존 금지)', () => {
    render(<LikeButton liked={false} count={4} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: '좋아요 4개' })).toBeInTheDocument()
  })

  it('count=0이어도 aria-label에 개수를 병기한다', () => {
    render(<LikeButton liked={false} count={0} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: '좋아요 0개' })).toBeInTheDocument()
  })

  it('클릭 시 onToggle을 호출한다', () => {
    const onToggle = vi.fn()
    render(<LikeButton liked={false} count={0} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('disabled면 onToggle이 호출되지 않고 disabled 속성을 가진다', () => {
    const onToggle = vi.fn()
    render(<LikeButton liked count={2} onToggle={onToggle} disabled />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('className을 병합한다(base + 사용자 클래스)', () => {
    render(<LikeButton liked={false} count={0} onToggle={() => {}} className="extra" />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass(cls('base'))
    expect(btn).toHaveClass('extra')
  })
})
