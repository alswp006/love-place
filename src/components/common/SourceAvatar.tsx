import type { ProfileMap } from '@/hooks/useProfiles'
import styles from './SourceAvatar.module.css'

// 출처 아바타(§5.5·ux §2) — 누가 추가/소유했는지 색+이니셜로. aria-label로 이름 안내(색만 의존 금지).
export function SourceAvatar({
  userId,
  profiles,
  myId,
  context,
}: {
  userId: string
  profiles: ProfileMap
  myId: string | null
  context?: string // 예: " 추가", " 일정"
}) {
  const p = profiles[userId]
  const isMe = userId === myId
  const name = p?.displayName.trim() || (isMe ? '나' : '상대')
  const color = p?.color ?? 'var(--c-text-weak)'
  const initial = name.slice(0, 1).toUpperCase()
  const label = `${name}${context ?? ''}`
  return (
    <span className={styles.avatar} style={{ backgroundColor: color }} aria-label={label} title={label}>
      {p?.avatarUrl ? <img src={p.avatarUrl} alt="" className={styles.img} /> : initial}
    </span>
  )
}
