import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import styles from './EmptyState.module.css'

// 친근한 빈 상태 + 행동 유도(§8 / ux-and-accessibility.md §7). 죽은 화면 금지.
//
// 이모지 → 아이콘: OS·버전마다 이모지 모양이 달라 통제가 안 되고, 한 화면에서 탭바(SVG)와
// 두 체계가 섞여 보였다. 세트 하나로 통일한다.
//
// art를 주면 아이콘 대신 일러스트를 쓴다. 탭의 첫인상(장소 0곳, 일정 0개…)은 앱을 처음
// 열었을 때 가장 오래 보는 화면이라, 여기만큼은 아이콘 하나보다 그림 한 장이 값을 한다.

/** public/illustrations/*.svg — 빈 상태 일러스트 4종. */
export type EmptyArt = 'map' | 'calendar' | 'trip' | 'recommend'

const ART_SRC: Record<EmptyArt, string> = {
  map: '/illustrations/spot-1-map.svg',
  calendar: '/illustrations/spot-2-calendar.svg',
  trip: '/illustrations/spot-3-trip.svg',
  recommend: '/illustrations/spot-4-recommend.svg',
}

type Props = {
  icon: IconName
  /** 있으면 아이콘 대신 이 일러스트를 그린다. */
  art?: EmptyArt
  title: string
  hint?: string
  action?: ReactNode
}

export function EmptyState({ icon, art, title, hint, action }: Props) {
  return (
    <div className={styles.empty}>
      <div className={art ? styles.art : styles.emoji} aria-hidden>
        {art ? (
          <img src={ART_SRC[art]} alt="" className={styles.artImg} loading="lazy" />
        ) : (
          <Icon name={icon} />
        )}
      </div>
      <p className={styles.title}>{title}</p>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
