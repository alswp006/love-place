// 아주 작은 마크다운 파서 — 법무 문서(docs/legal/*.md)를 공개 페이지로 그대로 내보내기 위한 것.
//
// 왜 파서를 쓰나: 정책 문구를 페이지 컴포넌트에 다시 쓰면 원문과 갈라진다. 그러면 "검토한 문서와
// 공개된 문서가 다른" 상태가 되는데, 법무 문서에서 그건 그냥 사고다. 원문 하나를 렌더한다.
//
// 왜 라이브러리를 안 쓰나: 우리 문서가 쓰는 문법이 제목·문단·목록·표·인용·굵게·링크뿐이다.
// 그거 때문에 수십 KB짜리 파서를 번들에 넣을 이유가 없다. 지원 범위 밖 문법은 문단으로 떨어진다.

export type Inline = { text: string; bold?: boolean; href?: string }

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; parts: Inline[] }
  | { kind: 'paragraph'; parts: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { kind: 'quote'; parts: Inline[] }
  | { kind: 'rule' }

/** `**굵게**` 와 `[문구](주소)` 만 처리한다. 나머지는 글자 그대로. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ text: m[1], bold: true })
    else out.push({ text: m[2]!, href: m[3] })
    last = m.index + m[0].length
  }
  if (last < src.length) out.push({ text: src.slice(last) })
  return out.filter((p) => p.text.length > 0)
}

const cells = (line: string): Inline[][] =>
  line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => parseInline(c.trim()))

/** 표 구분선(`|---|:--:|`)인가. */
const isDivider = (line: string): boolean => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')

export function parseMarkdown(src: string): Block[] {
  // HTML 주석은 **내부 메모** 자리다(문서 관리용 노트가 공개 페이지에 나가면 안 된다).
  // 원문 파일에서 지우는 대신 주석으로 두면 문서를 읽을 때는 보이고 공개면에서는 사라진다.
  const lines = src
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
  const blocks: Block[] = []
  let para: string[] = []

  const flushParagraph = () => {
    if (para.length === 0) return
    blocks.push({ kind: 'paragraph', parts: parseInline(para.join(' ')) })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const t = line.trim()

    if (t === '') {
      flushParagraph()
      continue
    }
    if (/^---+$/.test(t)) {
      flushParagraph()
      blocks.push({ kind: 'rule' })
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(t)
    if (h) {
      flushParagraph()
      blocks.push({ kind: 'heading', level: h[1]!.length as 1 | 2 | 3, parts: parseInline(h[2]!) })
      continue
    }
    if (t.startsWith('>')) {
      flushParagraph()
      // 이어지는 인용 줄을 한 덩어리로.
      const buf = [t.replace(/^>\s?/, '')]
      while (i + 1 < lines.length && lines[i + 1]!.trim().startsWith('>')) {
        buf.push(lines[++i]!.trim().replace(/^>\s?/, ''))
      }
      blocks.push({ kind: 'quote', parts: parseInline(buf.join(' ')) })
      continue
    }
    if (t.startsWith('|')) {
      flushParagraph()
      const head = cells(t)
      let j = i + 1
      if (j < lines.length && isDivider(lines[j]!.trim())) j++
      const rows: Inline[][][] = []
      while (j < lines.length && lines[j]!.trim().startsWith('|')) {
        rows.push(cells(lines[j]!.trim()))
        j++
      }
      blocks.push({ kind: 'table', head, rows })
      i = j - 1
      continue
    }
    const li = /^([-*]|\d+\.)\s+(.*)$/.exec(t)
    if (li) {
      flushParagraph()
      const ordered = /\d/.test(li[1]!)
      const items: Inline[][] = [parseInline(li[2]!)]
      while (i + 1 < lines.length) {
        const next = lines[i + 1]!.trim()
        const m2 = /^([-*]|\d+\.)\s+(.*)$/.exec(next)
        if (!m2 || /\d/.test(m2[1]!) !== ordered) break
        items.push(parseInline(m2[2]!))
        i++
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    para.push(t)
  }
  flushParagraph()
  return blocks
}

/**
 * `[자리표시자]`를 실제 값으로. 값이 없는 자리표시자가 **하나라도 남으면 던진다**.
 *
 * 던지는 이유: 정책 페이지에 `[사업자명]`이 그대로 노출되면 심사에서 반려되고, 무엇보다
 * 법적 고지로서 무효다. 조용히 그대로 내보내느니 빌드/렌더 단계에서 터지는 편이 낫다.
 */
export function fillPlaceholders(src: string, values: Record<string, string>): string {
  const filled = src.replace(/\[([^\]\n]+)\]/g, (whole, key: string) => {
    // 마크다운 링크 `[문구](주소)`는 건드리지 않는다.
    return values[key] ?? whole
  })
  // 링크 `[문구](주소)`는 제외하고, 남은 대괄호만 미완성으로 본다.
  const remaining = filled.match(/\[[^\]\n]+\](?!\()/g)
  if (remaining && remaining.length > 0) {
    throw new Error(`법무 문서에 채우지 않은 자리표시자가 남았습니다: ${[...new Set(remaining)].join(', ')}`)
  }
  return filled
}
