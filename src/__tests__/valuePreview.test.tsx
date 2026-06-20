import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ValuePreview } from '@/components/onboarding/ValuePreview'

// 브랜드뉴(미연결) 사용자 가치 미리보기 — '둘이 쓰면 이런 게 가능해요' (spec R3 line 51 value-preview arm).
describe('ValuePreview (미연결 사용자 가치 미리보기, R3 T4a)', () => {
  it('(a) "둘이 쓰면"을 포함하는 heading을 렌더한다', () => {
    render(<ValuePreview />)
    const heading = screen.getByRole('heading')
    expect(heading.textContent ?? '').toContain('둘이 쓰면')
  })

  it('(b) 시맨틱 <ul> 안에 최소 3개의 가치 항목(<li>)을 렌더한다', () => {
    render(<ValuePreview />)
    const list = screen.getByRole('list')
    const items = within(list).getAllByRole('listitem')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })

  it('(c) 각 항목은 텍스트 라벨을 접근 가능한 콘텐츠로 가진다(아이콘만으로 의미 전달 금지, §8)', () => {
    render(<ValuePreview />)
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    for (const item of items) {
      // 아이콘이 아니라 텍스트가 의미를 전달해야 한다.
      expect((item.textContent ?? '').trim().length).toBeGreaterThan(0)
    }
  })

  it('(d) 아이콘은 aria-hidden 이라 접근성 트리에서 제외된다', () => {
    const { container } = render(<ValuePreview />)
    const icons = container.querySelectorAll('[aria-hidden]')
    expect(icons.length).toBeGreaterThanOrEqual(3)
  })
})
