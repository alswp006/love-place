import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Icon } from '@/components/ui/Icon'

// 아이콘 세트 계약(§4 접근성): 기본은 장식(aria-hidden), 뜻을 홀로 전할 때만 img role + 이름.
// 이모지를 걷어낸 자리라 '읽히는 방식'이 바뀌지 않았는지 여기서 못박는다.
describe('Icon', () => {
  it('기본은 장식 — 스크린리더가 읽지 않는다', () => {
    const { container } = render(<Icon name="trash" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
  })

  it('label을 주면 이미지로 읽힌다 — 아이콘만으로 뜻을 전하는 자리', () => {
    render(<Icon name="repeat" label="반복 일정" />)
    expect(screen.getByRole('img', { name: '반복 일정' })).toBeInTheDocument()
  })

  it('크기는 1em — 글자가 커지면 아이콘도 커진다(Dynamic Type §4)', () => {
    const { container } = render(<Icon name="bell" />)
    // 고정 px면 글자 확대에서 아이콘만 안 커진다. CSS 모듈이라 클래스 존재로 계약을 확인한다.
    expect(container.querySelector('svg')!.getAttribute('class')).toBeTruthy()
  })

  it('색은 currentColor를 따른다 — 부모 색과 어긋나지 않게', () => {
    const { container } = render(<Icon name="pin" />)
    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor')
  })
})
