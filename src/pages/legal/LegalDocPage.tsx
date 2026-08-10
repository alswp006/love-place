import { Link } from 'react-router-dom'
import { parseMarkdown, fillPlaceholders, type Block, type Inline } from '@/lib/legal/markdown'
import { LEGAL_VALUES } from '@/lib/legal/appInfo'
import styles from './LegalDocPage.module.css'

// 공개 법무 문서 페이지 — 로그인 없이 열려야 한다.
// App Store Connect의 '개인정보처리방침 URL'과 심사관이 여기로 온다. 가드 안에 두면 둘 다 막힌다.
//
// 본문은 docs/legal/*.md 원문을 그대로 렌더한다(?raw import). 페이지에 다시 쓰면 원문과 갈라지고,
// 그러면 "검토한 문서와 공개된 문서가 다른" 상태가 된다.

function renderInline(parts: Inline[]) {
  return parts.map((p, i) => {
    if (p.href) {
      return (
        <a key={i} href={p.href} rel="noreferrer noopener" target="_blank">
          {p.text}
        </a>
      )
    }
    return p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>
  })
}

function renderBlock(b: Block, i: number) {
  switch (b.kind) {
    case 'heading': {
      const H = (['h1', 'h2', 'h3'] as const)[b.level - 1]!
      return <H key={i}>{renderInline(b.parts)}</H>
    }
    case 'paragraph':
      return <p key={i}>{renderInline(b.parts)}</p>
    case 'quote':
      return <blockquote key={i}>{renderInline(b.parts)}</blockquote>
    case 'rule':
      return <hr key={i} />
    case 'list':
      return b.ordered ? (
        <ol key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>
      ) : (
        <ul key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>
      )
    case 'table':
      return (
        // 표는 좁은 화면에서 가로 스크롤 — 본문이 가로로 밀리면 안 된다(ux §4).
        <div key={i} className={styles.tableWrap}>
          <table>
            <thead>
              <tr>{b.head.map((c, j) => <th key={j}>{renderInline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j}>{r.map((c, k) => <td key={k}>{renderInline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export function LegalDocPage({ source, title }: { source: string; title: string }) {
  const blocks = parseMarkdown(fillPlaceholders(source, LEGAL_VALUES))
  return (
    <main className={styles.wrap}>
      <nav className={styles.nav}>
        <Link to="/">← Weave</Link>
        <span className={styles.sep} aria-hidden>·</span>
        <Link to="/privacy">개인정보처리방침</Link>
        <span className={styles.sep} aria-hidden>·</span>
        <Link to="/location-policy">위치정보처리방침</Link>
      </nav>
      <article className={styles.doc} aria-label={title}>
        {blocks.map(renderBlock)}
      </article>
    </main>
  )
}
