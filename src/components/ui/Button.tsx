import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import styles from './Button.module.css'

// 공용 Button 프리미티브(마시멜로 R2) — 4 variant, button/link 양형, 공통 터치/포커스/모션.
// 색만으로 의미를 구분하지 않으므로(§a11y) danger 등 의미 전달이 필요하면 호출부에서 라벨/aria 병기.
export type ButtonVariant = 'primary' | 'cta' | 'ghost' | 'danger'

// CSS module 클래스는 vite/client 타입상 string|undefined(noUncheckedIndexedAccess) — classes()에서 falsy 필터.
const variantClass: Record<ButtonVariant, string | undefined> = {
  primary: styles.primary,
  cta: styles.cta,
  ghost: styles.ghost,
  danger: styles.danger,
}

type CommonProps = {
  variant?: ButtonVariant
  className?: string
  children: ReactNode
}

// as="button"(기본): 네이티브 button 속성 전체 전달.
type ButtonAsButton = CommonProps & {
  as?: 'button'
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>

// as="link": react-router Link로 렌더. to 필수, 그 외 anchor 속성 전달.
type ButtonAsLink = CommonProps & {
  as: 'link'
  to: LinkProps['to']
  disabled?: boolean
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'>

export type ButtonProps = ButtonAsButton | ButtonAsLink

function classes(variant: ButtonVariant, className?: string): string {
  return [styles.base, variantClass[variant], className].filter(Boolean).join(' ')
}

export function Button(props: ButtonProps) {
  const { variant = 'primary', className, children } = props

  if (props.as === 'link') {
    const { as: _as, to, disabled, variant: _v, className: _c, children: _ch, ...rest } = props
    // 비활성 링크는 네이티브 disabled가 없으므로 href 제거 + aria-disabled + 포커스 제외로 무력화.
    if (disabled) {
      const { onClick: _onClick, ...anchorRest } = rest
      return (
        <a
          {...anchorRest}
          className={classes(variant, className)}
          aria-disabled="true"
          tabIndex={-1}
          role="link"
        >
          {children}
        </a>
      )
    }
    return (
      <Link {...rest} to={to} className={classes(variant, className)}>
        {children}
      </Link>
    )
  }

  const { as: _as, variant: _v, className: _c, children: _ch, type, ...rest } = props
  return (
    <button {...rest} type={type ?? 'button'} className={classes(variant, className)}>
      {children}
    </button>
  )
}
