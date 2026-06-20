import { Outlet } from 'react-router-dom'
import { TabBar } from '@/components/nav/TabBar'
import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
import { OfflineQueueBadge } from '@/components/common/OfflineQueueBadge'
import styles from './AppLayout.module.css'

// 셸: 콘텐츠 영역 + 오프라인 배지 + 하단 탭바. safe-area를 존중(§8).
// 오프라인 큐(D2)는 셸 전역에 제공 — 모든 탭의 쓰기가 오프라인이면 큐에 적재, 재연결 시 동기화.
// 토스트(R1.5)는 상위 RequireAuth 셸에서 제공(온보딩 포함 전역) — 여기선 중첩하지 않는다.
export function AppLayout() {
  return (
    <OfflineQueueProvider>
      <div className={styles.shell}>
        {/* 키보드/스크린리더용 본문 바로가기(§8 접근성) — 포커스 시에만 보임 */}
        <a href="#main" className="skip-link">
          본문 바로가기
        </a>
        <main className={styles.content} id="main">
          <Outlet />
        </main>
        <OfflineQueueBadge />
        <TabBar />
      </div>
    </OfflineQueueProvider>
  )
}
