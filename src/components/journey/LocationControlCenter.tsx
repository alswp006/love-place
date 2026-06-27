import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useConsent, LOCATION_POLICY_VERSION } from '@/hooks/useConsent'
import { ConsentSheet } from './ConsentSheet'
import styles from './LocationControlCenter.module.css'

// 위치 컨트롤 센터(/us) — 동의 상태 + 관리 + '즉시 중단'(거절 불가·항상 가능, 위치정보법 제24조2).
// 색만 의존 금지(✓/✕ + 텍스트). 설계 §4·§5[3].
type Props = { coupleId: string | null; userId: string | null }

export function LocationControlCenter({ coupleId, userId }: Props) {
  const c = useConsent(coupleId, userId)
  const [sheetOpen, setSheetOpen] = useState(false)

  const stopNow = () =>
    c.withdraw('COLLECT_USE', { shownTextHash: `${LOCATION_POLICY_VERSION}:COLLECT_USE` })

  return (
    <section className={styles.wrap} aria-label="위치 동선 기록">
      <h2 className={styles.heading}>위치 동선 기록</h2>
      <Card className={styles.card}>
        <ul className={styles.status}>
          <li>
            <span aria-hidden>{c.canRecord ? '✓' : '✕'}</span>{' '}
            동선 수집·이용: <strong>{c.canRecord ? '켜짐' : '꺼짐'}</strong>
          </li>
          <li>
            <span aria-hidden>{c.canProvide ? '✓' : '✕'}</span>{' '}
            상대에게 제공: <strong>{c.canProvide ? '켜짐' : '꺼짐'}</strong>
          </li>
        </ul>

        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => setSheetOpen(true)}>
            동의 관리
          </Button>
          {c.canRecord ? (
            <Button variant="danger" onClick={stopNow}>
              위치 수집 즉시 중단
            </Button>
          ) : null}
        </div>

        <p className={styles.hint}>
          동의를 철회하면 기록된 동선과 제공 기록이 함께 파기돼요. 동선은 여행 리캡에서 개별 삭제할 수도 있어요.
        </p>
      </Card>

      <ConsentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        coupleId={coupleId}
        userId={userId}
      />
    </section>
  )
}
