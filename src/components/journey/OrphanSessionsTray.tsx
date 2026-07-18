import { useState } from 'react'
import { useOrphanSessions, useLinkSessionToTrip } from '@/hooks/useOrphanSessions'
import { useLocationWithdraw } from '@/hooks/useLocationWithdraw'
import { useTrips, useCreateTrip } from '@/hooks/useTrips'
import { Button } from '@/components/ui/Button'
import styles from './OrphanSessionsTray.module.css'

// 미연결 동선 트레이(/us) — A안 부작용 처리. 여행에 연결하거나 삭제. 연결 안 하면 14일 후 자동 삭제 경고.
// '동선으로 여행 만들기' — 여행이 없어도 원탭으로 [동선 날짜의 여행 생성 → 즉시 연결](마찰 최소).
type Props = { coupleId: string | null; userId: string | null }

export function OrphanSessionsTray({ coupleId, userId }: Props) {
  const orphans = useOrphanSessions(coupleId)
  const trips = useTrips(coupleId)
  const linker = useLinkSessionToTrip(coupleId, userId)
  const withdraw = useLocationWithdraw(coupleId)
  const createTrip = useCreateTrip(coupleId, userId)
  const [pick, setPick] = useState<Record<string, string>>({})

  const makeTripFromSession = (s: { id: string; version: number; started_at: string; ended_at: string | null }) => {
    const day = (s.ended_at ?? s.started_at).slice(0, 10)
    createTrip.mutate(
      { title: `${day} 여행`, startDate: day, endDate: day },
      { onSuccess: (tripId) => void linker.link({ id: s.id, version: s.version, tripId }) },
    )
  }

  const list = orphans.data ?? []
  if (list.length === 0) return null // 부분 빈상태 — 트레이 자체를 숨김

  return (
    <div className={styles.wrap} aria-label="미연결 동선">
      <p className={styles.head}>
        미연결 동선 <span className={styles.warn}>· 연결 안 하면 14일 후 자동 삭제</span>
      </p>
      <ul className={styles.list}>
        {list.map((s) => {
          const picked = pick[s.id] ?? ''
          return (
            <li key={s.id} className={styles.row}>
              <span className={styles.meta}>
                {(s.ended_at ?? s.started_at).slice(0, 10)} · {s.point_count}점
              </span>
              <div className={styles.actions}>
                <select
                  aria-label="여행 선택"
                  className={styles.select}
                  value={picked}
                  onChange={(e) => setPick((p) => ({ ...p, [s.id]: e.target.value }))}
                >
                  <option value="">여행 선택…</option>
                  {(trips.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  disabled={!picked || linker.isPending}
                  onClick={() => {
                    if (picked) void linker.link({ id: s.id, version: s.version, tripId: picked })
                  }}
                >
                  연결
                </Button>
                <Button
                  variant="primary"
                  disabled={createTrip.isPending || linker.isPending}
                  onClick={() => makeTripFromSession(s)}
                  aria-label="이 동선으로 여행 만들기"
                >
                  여행 만들기
                </Button>
                <Button variant="danger" onClick={() => void withdraw.withdraw({ sessionId: s.id })}>
                  삭제
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
