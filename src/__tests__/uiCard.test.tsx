import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from '@/components/ui/Card'
import styles from '@/components/ui/Card.module.css'

// 공용 Card 프리미티브(마시멜로 R2) — 표면 컨테이너. as 다형 + soft 변형 + className 병합 + children.
// CSS module 클래스명은 빌드에서 해시되므로 동일 모듈을 import해 해시된 값으로 단언한다(Button 테스트와 동일 패턴).
function cls(name: keyof typeof styles): string {
  const c = styles[name]
  if (!c) throw new Error(`Card.module.css에 .${String(name)} 클래스가 없음`)
  return c
}

describe('Card 프리미티브(렌더 · 클래스 · children · soft · as, R2)', () => {
  it('기본 div로 렌더하고 base 클래스 + children을 가진다', () => {
    render(<Card>내용</Card>)
    const card = screen.getByText('내용')
    expect(card.tagName).toBe('DIV')
    expect(card).toHaveClass(cls('base'))
    expect(card).toHaveTextContent('내용')
  })

  it('soft prop이 없으면 soft 클래스를 가지지 않는다', () => {
    render(<Card>기본</Card>)
    expect(screen.getByText('기본')).not.toHaveClass(cls('soft'))
  })

  it('soft prop이면 soft 클래스를 추가로 가진다', () => {
    render(<Card soft>부드러운</Card>)
    const card = screen.getByText('부드러운')
    expect(card).toHaveClass(cls('base'))
    expect(card).toHaveClass(cls('soft'))
  })

  it('as prop으로 요소 태그를 바꾼다(section)', () => {
    render(<Card as="section">섹션</Card>)
    const card = screen.getByText('섹션')
    expect(card.tagName).toBe('SECTION')
    expect(card).toHaveClass(cls('base'))
  })

  it('className을 병합한다(base + 사용자 클래스)', () => {
    render(<Card className="extra">병합</Card>)
    const card = screen.getByText('병합')
    expect(card).toHaveClass(cls('base'))
    expect(card).toHaveClass('extra')
  })

  it('그 외 속성을 전달한다(aria-label 등)', () => {
    render(
      <Card aria-label="카드 영역">
        <span>자식</span>
      </Card>,
    )
    expect(screen.getByLabelText('카드 영역')).toBeInTheDocument()
  })
})
