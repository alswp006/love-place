import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Chip } from '@/components/ui/Chip'
import styles from '@/components/ui/Chip.module.css'

// 공용 Chip 프리미티브(마시멜로 R2) — pill 칩. tone별 클래스 + className 병합 + children + span 속성.
// CSS module 클래스명은 빌드에서 해시되므로 동일 모듈을 import해 해시된 값으로 단언한다(Button/Card 테스트와 동일 패턴).
function cls(name: keyof typeof styles): string {
  const c = styles[name]
  if (!c) throw new Error(`Chip.module.css에 .${String(name)} 클래스가 없음`)
  return c
}

describe('Chip 프리미티브(tone · children · className · span 속성, R2)', () => {
  it('기본 tone=pink로 <span>을 렌더하고 base + pink 클래스 + children을 가진다', () => {
    render(<Chip>핑크</Chip>)
    const chip = screen.getByText('핑크')
    expect(chip.tagName).toBe('SPAN')
    expect(chip).toHaveClass(cls('base'))
    expect(chip).toHaveClass(cls('pink'))
    expect(chip).toHaveTextContent('핑크')
  })

  it.each([
    ['pink', 'pink'],
    ['ok', 'ok'],
    ['danger', 'danger'],
    ['neutral', 'neutral'],
  ] as const)('tone=%s → %s 클래스를 가진다', (tone, expected) => {
    render(<Chip tone={tone}>라벨</Chip>)
    const chip = screen.getByText('라벨')
    expect(chip).toHaveClass(cls('base'))
    expect(chip).toHaveClass(cls(expected))
  })

  it('className을 병합한다(base/tone + 사용자 클래스)', () => {
    render(
      <Chip className="extra" tone="ok">
        병합
      </Chip>,
    )
    const chip = screen.getByText('병합')
    expect(chip).toHaveClass(cls('base'))
    expect(chip).toHaveClass(cls('ok'))
    expect(chip).toHaveClass('extra')
  })

  it('그 외 span 속성을 전달한다(aria-label 등)', () => {
    render(
      <Chip aria-label="확정됨" tone="ok">
        <span aria-hidden="true">✓</span> 확정
      </Chip>,
    )
    expect(screen.getByLabelText('확정됨')).toBeInTheDocument()
  })
})
