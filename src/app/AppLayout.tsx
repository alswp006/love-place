import { Outlet } from 'react-router-dom'
import { TabBar } from '@/components/nav/TabBar'
import styles from './AppLayout.module.css'

// 셸: 콘텐츠 영역 + 하단 탭바. safe-area를 존중(§8).
export function AppLayout() {
  return (
    <div className={styles.shell}>
      <main className={styles.content} id="main">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
