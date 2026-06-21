import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

// 공용 Card 프리미티브(마시멜로 R2) — 표면 컨테이너. as 다형(기본 div), soft 변형, className 병합.
// 색만으로 의미를 구분하지 않으므로(§a11y) 의미 전달이 필요하면 호출부에서 라벨/aria 병기.
export type CardProps = {
  // 렌더할 요소 태그(기본 div). section/article 등 시맨틱 요소로 교체 가능.
  as?: ElementType
  // 더 부드러운 표면 톤(--surface-soft).
  soft?: boolean
  className?: string
  children: ReactNode
  // 그 외 표준 HTML 속성(aria-label, role, id 등) 전달.
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>

// CSS module 클래스는 vite/client 타입상 string|undefined(noUncheckedIndexedAccess) — falsy 필터로 합친다.
function classes(soft: boolean, className?: string): string {
  return [styles.base, soft ? styles.soft : undefined, className].filter(Boolean).join(' ')
}

export function Card({ as, soft = false, className, children, ...rest }: CardProps) {
  const Tag = as ?? 'div'
  return (
    <Tag {...rest} className={classes(soft, className)}>
      {children}
    </Tag>
  )
}
