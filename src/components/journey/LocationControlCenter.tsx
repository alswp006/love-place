import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useConsent, LOCATION_POLICY_VERSION } from '@/hooks/useConsent'
import { ConsentSheet } from './ConsentSheet'
import { OrphanSessionsTray } from './OrphanSessionsTray'
import { ProvideFeed } from './ProvideFeed'
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

        {/* 내 동선이 열람된 사실 통보(위치정보법 제19조) — docs/legal/location-policy.md가
            이용자에게 "앱 내 활동 피드로 통지합니다"라고 약속한 부분. 로깅·도출·테스트는
            이미 있었는데 렌더처가 0곳이라 약속이 화면에 닿지 않고 있었다.
            상대를 감시하는 화면이 아니라 '내 데이터가 어떻게 쓰였나'를 나에게 보여주는 방향이다. */}
        <ProvideFeed coupleId={coupleId} userId={userId} notifyMode={c.notifyMode} />

        {/* 미연결 동선(A안) — 여행에 연결하거나 삭제. 14일 후 자동 파기. */}
        <OrphanSessionsTray coupleId={coupleId} userId={userId} />
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
