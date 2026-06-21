import type { ButtonHTMLAttributes } from 'react'
import styles from './LikeButton.module.css'

// 공용 LikeButton 프리미티브(마시멜로 R2) — 단일 ❤️ 좋아요 토글(reactions와 1:1 매핑).
// 채운/빈 하트(❤️/🤍) + 카운트. 좋아요 색(--like)은 형태(채운 하트)로만 이중화하고
// 텍스트 색으로 쓰지 않는다. 의미는 aria-pressed + aria-label("좋아요 N개")이 전달한다(§a11y 색만 의존 금지).
// 탭 시 살짝 통통 팝(scale 1→1.15→1)은 prefers-reduced-motion에서 생략(CSS).
export type LikeButtonProps = {
  // 현재 사용자가 눌렀는지(reactions 존재 여부). aria-pressed와 글리프(❤️/🤍)를 가른다.
  liked: boolean
  // 좋아요 총 개수(aria-label + 표시 카운트).
  count: number
  // 토글 핸들러(낙관적 업데이트/reactions 토글은 호출부 책임).
  onToggle: () => void
  disabled?: boolean
  className?: string
  // 그 외 표준 button 속성 전달(id, data-*, onFocus 등). aria/type/onClick은 내부 고정.
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children' | 'onClick' | 'type' | 'aria-pressed' | 'aria-label' | 'disabled'
>

function classes(liked: boolean, className?: string): string {
  return [styles.base, liked ? styles.liked : undefined, className].filter(Boolean).join(' ')
}

export function LikeButton({ liked, count, onToggle, disabled, className, ...rest }: LikeButtonProps) {
  return (
    <button
      {...rest}
      type="button"
      className={classes(liked, className)}
      aria-pressed={liked}
      aria-label={`좋아요 ${count}개`}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className={styles.glyph} aria-hidden="true">
        {liked ? '❤️' : '🤍'}
      </span>
      <span aria-hidden="true">{count}</span>
    </button>
  )
}
