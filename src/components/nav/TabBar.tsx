import { NavLink } from 'react-router-dom'
import { MapPin, CalendarDays, Heart, Sparkles, Users, type IconComponent } from './icons'
import styles from './TabBar.module.css'

// 5탭 IA(설계서 §3). 색만으로 구분하지 않도록 아이콘(채움 상태) + 라벨 텍스트 병기(§8 접근성).
// 터치 타깃 ≥44px(HIG).
type Tab = {
  to: string
  label: string
  Icon: IconComponent
  end?: boolean
}

const TABS: Tab[] = [
  { to: '/', label: '지도', Icon: MapPin, end: true },
  { to: '/calendar', label: '일정', Icon: CalendarDays },
  { to: '/places', label: '장소', Icon: Heart },
  { to: '/discover', label: '추천', Icon: Sparkles },
  { to: '/us', label: '우리', Icon: Users },
]

export function TabBar() {
  return (
    <nav className={styles.tabbar} aria-label="주요 메뉴">
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
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
