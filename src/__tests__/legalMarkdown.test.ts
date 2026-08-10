import { describe, it, expect } from 'vitest'
import { parseMarkdown, parseInline, fillPlaceholders } from '@/lib/legal/markdown'
import { LEGAL_VALUES } from '@/lib/legal/appInfo'
import privacyRaw from '../../docs/legal/privacy-policy.md?raw'
import locationRaw from '../../docs/legal/location-policy.md?raw'

// 공개되는 법무 문서는 **원문 그대로** 나가야 한다. 이 파일이 지키는 것 셋:
//   ① 내부 메모(HTML 주석)가 공개면에 새지 않는다
//   ② 자리표시자가 그대로 노출되지 않는다(노출되면 심사 반려 + 법적 고지로 무효)
//   ③ 실제 문서가 실제로 렌더된다(빈 페이지로 조용히 통과하지 않는다)

describe('parseInline', () => {
  it('굵게와 링크를 나눈다', () => {
    expect(parseInline('보통 **굵게** 끝')).toEqual([
      { text: '보통 ' },
      { text: '굵게', bold: true },
      { text: ' 끝' },
    ])
    expect(parseInline('[문서](https://x.test)')).toEqual([
      { text: '문서', href: 'https://x.test' },
    ])
  })
  it('빈 조각은 버린다', () => {
    expect(parseInline('**굵게**')).toEqual([{ text: '굵게', bold: true }])
  })
})

describe('parseMarkdown', () => {
  it('HTML 주석(내부 메모)은 통째로 사라진다 — 공개면에 나가면 안 된다', () => {
    const blocks = parseMarkdown('# 제목\n\n<!-- 내부 메모: 절대 공개 금지 -->\n\n본문')
    const text = JSON.stringify(blocks)
    expect(text).not.toContain('내부 메모')
    expect(text).toContain('본문')
  })

  it('제목·문단·목록·인용·구분선을 구분한다', () => {
    const blocks = parseMarkdown('# H1\n## H2\n\n문단\n\n- 하나\n- 둘\n\n> 인용\n\n---')
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading', 'heading', 'paragraph', 'list', 'quote', 'rule',
    ])
  })

  it('번호 목록과 글머리 목록을 섞지 않는다', () => {
    const blocks = parseMarkdown('1. 하나\n2. 둘\n\n- 셋')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: true })
    expect(blocks[1]).toMatchObject({ kind: 'list', ordered: false })
  })

  it('표는 헤더와 행으로 — 구분선은 데이터가 아니다', () => {
    const blocks = parseMarkdown('| 수탁자 | 업무 |\n|---|---|\n| Supabase | DB |\n| NCP | 지도 |')
    const t = blocks[0]
    expect(t).toMatchObject({ kind: 'table' })
    if (t?.kind !== 'table') throw new Error('table 아님')
    expect(t.head).toHaveLength(2)
    expect(t.rows).toHaveLength(2)
    expect(t.rows[0]![0]![0]!.text).toBe('Supabase')
  })
})

describe('fillPlaceholders', () => {
  it('자리표시자를 채운다', () => {
    expect(fillPlaceholders('**[사업자명]**은', { 사업자명: '김민제' })).toBe('**김민제**은')
  })

  it('마크다운 링크는 건드리지 않는다', () => {
    const src = '[문서](https://x.test)를 보세요'
    expect(fillPlaceholders(src, {})).toBe(src)
  })

  it('못 채운 자리표시자가 남으면 **던진다** — 조용히 공개되면 심사 반려 + 고지 무효', () => {
    expect(() => fillPlaceholders('[사업자명]과 [연락처]', { 사업자명: 'x' })).toThrow(/연락처/)
  })
})

describe('실제 공개 문서', () => {
  for (const [name, raw] of [
    ['개인정보처리방침', privacyRaw],
    ['위치정보처리방침', locationRaw],
  ] as const) {
    it(`${name}: 자리표시자가 전부 채워진다`, () => {
      expect(() => fillPlaceholders(raw, LEGAL_VALUES)).not.toThrow()
    })

    it(`${name}: 내용이 실제로 렌더된다(빈 페이지로 통과하지 않는다)`, () => {
      const blocks = parseMarkdown(fillPlaceholders(raw, LEGAL_VALUES))
      expect(blocks.length).toBeGreaterThan(10)
      expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 })
    })

    it(`${name}: 내부 메모가 새지 않는다`, () => {
      const text = JSON.stringify(parseMarkdown(fillPlaceholders(raw, LEGAL_VALUES)))
      expect(text).not.toContain('내부 메모')
      expect(text).not.toContain('출시 전 채울 것')
    })
  }

  it('위치정보처리방침이 하지 않은 신고를 했다고 말하지 않는다', () => {
    // 신고 전에 "신고를 하고"라고 쓰면 허위 고지다. 신고를 마치면 이 테스트를 함께 고친다.
    //
    // ⚠️ 검사 대상은 **렌더 결과**다. 원문에는 왜 바꿨는지 설명하는 HTML 주석에 옛 문구가
    //    인용돼 있는데, 그건 공개되지 않는다. 원문을 검사하면 그 주석에 걸려 오탐이 난다
    //    (처음에 그렇게 짰다가 걸렸다).
    const published = JSON.stringify(parseMarkdown(fillPlaceholders(locationRaw, LEGAL_VALUES)))
    expect(published).not.toMatch(/위치기반서비스사업 신고\(.{0,40}\)를 하고/)
    expect(published).toContain('신고를 완료할 예정')
  })
})
