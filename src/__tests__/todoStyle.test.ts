import { describe, it, expect } from 'vitest'
import {
  todoBlockColors,
  parseHex,
  contrast,
  LIGHT_SURFACES,
  DARK_SURFACES,
} from '@/lib/calendar/todoStyle'
import { WEAVE_PALETTE } from '@/lib/colorPalette'

// 할 일 블록 색 — 사용자가 고른 분류 색에서 **도출**한다(§7).
// 파스텔을 넣은 뒤로 "연한 면 위 흰 글자"가 안 읽히는 일이 실제 위험이라 대비를 재서 못 박는다.

const c = (hex: string) => parseHex(hex)!

describe.each([
  ['라이트', LIGHT_SURFACES],
  ['다크', DARK_SURFACES],
] as const)('%s 모드 — 팔레트 전부', (_name, surfaces) => {
  for (const entry of WEAVE_PALETTE) {
    it(`${entry.label}: 채운 블록 위 글자가 AA(4.5:1)`, () => {
      const t = todoBlockColors(entry.hex, surfaces)
      expect(contrast(c(t.onFill), c(t.fill))).toBeGreaterThanOrEqual(4.5)
    })

    it(`${entry.label}: 미완료 테두리가 배경과 3:1 이상`, () => {
      const t = todoBlockColors(entry.hex, surfaces)
      expect(contrast(c(t.outline), surfaces.bg)).toBeGreaterThanOrEqual(3.0)
    })
  }
})

describe('도출의 성질', () => {
  it('분류가 다르면 채움도 다르다 — 전부 같은 색으로 수렴하면 안 된다', () => {
    const fills = WEAVE_PALETTE.map((e) => todoBlockColors(e.hex).fill)
    expect(new Set(fills).size).toBe(WEAVE_PALETTE.length)
  })

  it('원래 색에서 멀리 가지 않는다 — 옐로가 갈색이 되면 분류를 못 알아본다', () => {
    for (const e of WEAVE_PALETTE) {
      const t = todoBlockColors(e.hex)
      expect(contrast(c(t.fill), c(e.hex)), e.label).toBeLessThan(3.0)
    }
  })

  it('같은 입력이면 같은 결과 — 프레임마다 색이 흔들리지 않는다', () => {
    const a = todoBlockColors('#4fb58a')
    const b = todoBlockColors('#4fb58a')
    expect(a).toEqual(b)
  })

  it('분류 없음은 브랜드 핑크가 아니다 — 상대 트랙으로 읽힌다', () => {
    expect(todoBlockColors(null).fill).not.toBe('#e2638a')
    expect(todoBlockColors(undefined).outline).not.toBe('#e2638a')
  })

  it('깨진 값도 그려진다 — 색 하나 때문에 달력이 죽지 않는다', () => {
    for (const bad of ['', 'nope', '#12', '#xyzxyz']) {
      const t = todoBlockColors(bad)
      expect(t.fill).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrast(c(t.onFill), c(t.fill))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('파스텔은 잉크 글자를, 진한 색은 흰 글자를 받는다 — 경계가 살아 있다', () => {
    // 전부 한쪽으로 수렴하면 위 대비 테스트가 통과해도 판정이 죽은 것이다.
    const onFills = new Set(WEAVE_PALETTE.map((e) => todoBlockColors(e.hex).onFill))
    expect(onFills.size).toBe(2)
    expect(todoBlockColors('#f5c2d0').onFill).toBe(todoBlockColors('#f5ddab').onFill) // 파스텔끼리 같다
  })
})

describe('parseHex', () => {
  it("'#rrggbb'를 읽는다(대소문자·공백·# 없는 꼴 포함)", () => {
    expect(parseHex('#4FB58A')).toEqual({ r: 79, g: 181, b: 138 })
    expect(parseHex(' 4fb58a ')).toEqual({ r: 79, g: 181, b: 138 })
  })
  it('못 읽으면 null', () => {
    for (const bad of [null, undefined, '', '#fff', 'rgb(1,2,3)']) {
      expect(parseHex(bad)).toBeNull()
    }
  })
})
