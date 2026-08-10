import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { TABS } from '@/app/tabs'
import { publishTabbarHeight } from '@/lib/layout/tabbarHeight'
import styles from './TabBar.module.css'

// 5탭 IA(설계서 §3 — 장소는 지도에 통합, 여행은 '우리'에서 승격) — 메타는 @/app/tabs의 단일 출처에서 도출.
// 색만으로 구분하지 않도록 아이콘(채움 상태) + 라벨 텍스트 병기(§8 접근성). 터치 타깃 ≥44px(HIG).
export function TabBar() {
  // 탭바가 자기 높이를 재서 --tabbar-h로 발행한다(시트·백드롭·토스트·FAB이 이걸 읽는다).
  // ResizeObserver인 이유: 높이가 글자 크기에서 파생돼 resize 이벤트 없이도 바뀐다(Dynamic Type).
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    publishTabbarHeight(el)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => publishTabbarHeight(el))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <nav ref={ref} data-tabbar className={styles.tabbar} aria-label="주요 메뉴">
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
