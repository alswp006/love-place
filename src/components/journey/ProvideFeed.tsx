import { useLocationProvideFeed } from '@/hooks/useLocationProvideFeed'
import { Skeleton } from '@/components/common/Skeleton'
import type { NotifyMode } from '@/lib/journey/types'
import styles from './ProvideFeed.module.css'

// 내 동선 열람 통보(위치정보법 제19조 / docs/legal/location-policy.md).
// 표시 대상은 "내가 정보주체인 PROVIDE 로그"뿐 — 상대 감시가 아니라 내 데이터 이용 내역이다.
// notify_mode(IMMEDIATE / BATCHED_30D)에 따라 무엇을 보여줄지는 buildProvideFeed가 이미 결정한다.
type Props = { coupleId: string | null; userId: string | null; notifyMode: NotifyMode }

export function ProvideFeed({ coupleId, userId, notifyMode }: Props) {
  const { items, isLoading } = useLocationProvideFeed(coupleId, userId, notifyMode)

  return (
    <section className={styles.wrap} aria-label="내 동선 열람 내역">
      <h3 className={styles.title}>내 동선 열람 내역</h3>
      {isLoading ? (
        <Skeleton count={2} label="열람 내역 불러오는 중" />
      ) : items.length === 0 ? (
        // 죽은 화면 금지(§7) — '기록이 없다'가 곧 안심되는 정보라 그렇게 읽히게 쓴다.
        <p className={styles.empty}>아직 상대가 내 동선을 열람한 기록이 없어요.</p>
      ) : (
        // Realtime은 아니지만 조회 갱신 시 스크린리더가 놓치지 않게.
        <ul className={styles.list} aria-live="polite">
          {items.map((it) => (
            <li key={it.id} className={styles.item}>
              <span className={styles.label}>{it.label}</span>
              <span className={styles.detail}>{it.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
