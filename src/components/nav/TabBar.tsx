import { NavLink } from 'react-router-dom'
import { TABS } from '@/app/tabs'
import styles from './TabBar.module.css'

// 4탭 IA(설계서 §3 — 장소 탭은 지도에 통합) — 메타는 @/app/tabs의 단일 출처에서 도출.
// 색만으로 구분하지 않도록 아이콘(채움 상태) + 라벨 텍스트 병기(§8 접근성). 터치 타깃 ≥44px(HIG).
export function TabBar() {
  return (
    <nav className={styles.tabbar} aria-label="주요 메뉴">
      {TABS.map(({ path, label, Icon, index }) => (
        <NavLink
          key={path}
          to={path}
          end={index}
          viewTransition
          className={({ isActive }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)}
        >
          {({ isActive }) => (
            <>
              <Icon filled={isActive} className={styles.icon} />
              <span className={styles.label}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
