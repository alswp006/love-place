import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Chip.module.css'

// 공용 Chip 프리미티브(마시멜로 R2) — pill 칩(라벨/배지/필터). tone별 표면+잉크 쌍, className 병합.
// tone은 의미를 색으로만 전달하지 않는다(§a11y 색만 의존 금지). ok/danger 등 시맨틱 tone은
// 호출부에서 아이콘 + 텍스트(또는 aria-label)를 children에 함께 넣는 것을 권장한다.
//   예: <Chip tone="ok"><span aria-hidden>✓</span> 확정</Chip>
// children은 그대로 두므로(라벨 강제 X) 색·형태 이중화 책임은 호출부에 있다.
export type ChipTone = 'pink' | 'ok' | 'danger' | 'neutral'

// CSS module 클래스는 vite/client 타입상 string|undefined(noUncheckedIndexedAccess) — classes()에서 falsy 필터.
const toneClass: Record<ChipTone, string | undefined> = {
  pink: styles.pink,
  ok: styles.ok,
  danger: styles.danger,
  neutral: styles.neutral,
}

export type ChipProps = {
  // 색 톤(기본 pink). 시맨틱 tone(ok/danger)은 아이콘+텍스트 병기 권장(위 주석 참고).
  tone?: ChipTone
  className?: string
  children: ReactNode
  // 그 외 표준 span 속성(aria-label, role, id, onClick 등) 전달.
} & Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'children'>

function classes(tone: ChipTone, className?: string): string {
  return [styles.base, toneClass[tone], className].filter(Boolean).join(' ')
}

export function Chip({ tone = 'pink', className, children, ...rest }: ChipProps) {
  return (
    <span {...rest} className={classes(tone, className)}>
      {children}
    </span>
  )
}
