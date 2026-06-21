import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Field } from '@/components/ui/Field'
import styles from '@/components/ui/Field.module.css'

// 공용 Field 프리미티브(마시멜로 R2) — input/textarea 래퍼.
// label aria 연결(htmlFor/id) + error 텍스트(role) + as='input'|'textarea' + className 병합.
// CSS module 클래스명은 빌드에서 해시되므로 동일 모듈을 import해 해시된 값으로 단언한다(Button/Card/Chip 테스트와 동일 패턴).
function cls(name: keyof typeof styles): string {
  const c = styles[name]
  if (!c) throw new Error(`Field.module.css에 .${String(name)} 클래스가 없음`)
  return c
}

describe('Field 프리미티브(렌더 · label 연결 · 입력 · error · as, R2)', () => {
  it('기본 input을 렌더하고 control 클래스를 가진다', () => {
    render(<Field id="f1" value="" onChange={() => {}} placeholder="이름" />)
    const input = screen.getByPlaceholderText('이름')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveClass(cls('control'))
    expect(input).toHaveAttribute('id', 'f1')
  })

  it('label을 id로 연결한다(htmlFor ↔ input id)', () => {
    render(<Field id="name" label="이름" value="" onChange={() => {}} />)
    // label 텍스트로 control을 찾을 수 있으면 aria 연결됨
    const input = screen.getByLabelText('이름')
    expect(input).toHaveAttribute('id', 'name')
    const label = screen.getByText('이름')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', 'name')
  })

  it('label이 없으면 label 요소를 렌더하지 않는다', () => {
    render(<Field id="f2" value="" onChange={() => {}} placeholder="검색" />)
    expect(screen.queryByText('검색', { selector: 'label' })).toBeNull()
    expect(document.querySelector('label')).toBeNull()
  })

  it('입력하면 onChange가 호출된다(change 이벤트 전달)', async () => {
    const user = userEvent.setup()
    // value를 ''에 고정하면 React가 입력을 되돌리므로 onChange 호출 여부만 단언.
    // 실제 값 흐름은 아래 제어 입력 테스트에서 검증한다.
    const onChange = vi.fn()
    render(<Field id="f3" value="" onChange={onChange} placeholder="메모" />)
    await user.type(screen.getByPlaceholderText('메모'), 'a')
    expect(onChange).toHaveBeenCalledTimes(1)
    const ev = onChange.mock.calls[0]?.[0] as { target: EventTarget } | undefined
    expect(ev?.target).toBeInstanceOf(HTMLInputElement)
  })

  it('제어 입력으로 동작한다(value 반영)', async () => {
    const user = userEvent.setup()
    function Controlled() {
      const [v, setV] = useState('')
      return <Field id="c1" label="제어" value={v} onChange={(e) => setV(e.target.value)} />
    }
    render(<Controlled />)
    const input = screen.getByLabelText('제어') as HTMLInputElement
    await user.type(input, '하이')
    expect(input.value).toBe('하이')
  })

  it('error가 있으면 alert role 텍스트를 보여주고 control을 aria-invalid + aria-describedby로 연결한다', () => {
    render(<Field id="e1" label="이메일" value="bad" onChange={() => {}} error="형식이 올바르지 않아요" />)
    const err = screen.getByRole('alert')
    expect(err).toHaveTextContent('형식이 올바르지 않아요')
    const input = screen.getByLabelText('이메일')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toBe(err.id)
  })

  it('error가 없으면 alert role과 aria-invalid가 없다', () => {
    render(<Field id="e2" label="이메일" value="ok@x.com" onChange={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('이메일')).not.toHaveAttribute('aria-invalid')
  })

  it("as='textarea'면 textarea를 렌더한다", () => {
    render(<Field id="t1" as="textarea" label="설명" value="" onChange={() => {}} />)
    const ta = screen.getByLabelText('설명')
    expect(ta.tagName).toBe('TEXTAREA')
    expect(ta).toHaveClass(cls('control'))
  })

  it("type을 전달한다(as='input' 기본)", () => {
    render(<Field id="ty1" type="email" label="메일" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('메일')).toHaveAttribute('type', 'email')
  })

  it('className을 wrapper에 병합한다', () => {
    const { container } = render(
      <Field id="m1" className="extra" value="" onChange={() => {}} placeholder="x" />,
    )
    const wrap = container.firstElementChild
    expect(wrap).toHaveClass(cls('wrapper'))
    expect(wrap).toHaveClass('extra')
  })
})
