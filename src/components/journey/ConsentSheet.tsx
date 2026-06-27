import { Dialog } from '@/components/common/Dialog'
import { Button } from '@/components/ui/Button'
import { useConsent, LOCATION_POLICY_VERSION } from '@/hooks/useConsent'
import type { ConsentType } from '@/lib/journey/types'
import styles from './ConsentSheet.module.css'

// 위치 동선 4종 동의 시트 — 기본 OFF·분리 토글(다크패턴 금지), 목적·보관·제공대상 고지(위치정보법 제18·19조).
// (b)제3자 제공을 유보해도 닫기 가능(핵심기능 비차단, §10.3). 설계 §4.
type Props = { open: boolean; onClose: () => void; coupleId: string | null; userId: string | null }

const hashFor = (t: ConsentType) => `${LOCATION_POLICY_VERSION}:${t}`

export function ConsentSheet({ open, onClose, coupleId, userId }: Props) {
  const c = useConsent(coupleId, userId)

  const toggleCollect = () =>
    c.canRecord
      ? c.withdraw('COLLECT_USE', { shownTextHash: hashFor('COLLECT_USE') })
      : c.grant('COLLECT_USE', { scope: 'RECAP', shownTextHash: hashFor('COLLECT_USE') })

  const toggleProvide = () =>
    c.canProvide
      ? c.withdraw('THIRD_PARTY_PROVIDE_PARTNER', { shownTextHash: hashFor('THIRD_PARTY_PROVIDE_PARTNER') })
      : c.grant('THIRD_PARTY_PROVIDE_PARTNER', { shownTextHash: hashFor('THIRD_PARTY_PROVIDE_PARTNER') })

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="위치 동선 동의 관리" className={styles.sheet}>
      <h2 className={styles.title}>위치 동선 기록 동의</h2>
      <p className={styles.lede}>
        여행 동선 기록은 둘만의 회고를 위한 기능이에요. 아래 동의는 각각 켜고 끌 수 있고, 언제든 철회할 수 있어요.
      </p>

      <ul className={styles.list}>
        <li className={styles.row}>
          <label className={styles.label}>
            <input
              type="checkbox"
              checked={c.canRecord}
              onChange={toggleCollect}
              aria-label="개인위치정보 수집·이용 동의"
            />
            <span className={styles.labelText}>
              <strong>개인위치정보 수집·이용 동의</strong>
              <span className={styles.copy}>
                목적: 둘의 여행 동선 기록·지도 표시 · 보관: 철회 시까지(목적 달성 시 즉시 파기) · 수집: 기기 GPS
              </span>
            </span>
          </label>
        </li>

        <li className={styles.row}>
          <label className={styles.label}>
            <input
              type="checkbox"
              checked={c.canProvide}
              onChange={toggleProvide}
              aria-label="상대에게 동선 제공 동의 (선택)"
            />
            <span className={styles.labelText}>
              <strong>상대에게 내 동선 제공 동의 <span className={styles.optional}>(선택)</span></strong>
              <span className={styles.copy}>
                제공받는 자: 연결된 상대 · 목적: 여행 동선 공유 · 유보해도 핵심 기능을 이용할 수 있어요.
              </span>
            </span>
          </label>
        </li>

        <li className={styles.row}>
          <span className={styles.labelText}>
            <strong>제공 사실 통보 방식</strong>
            <span className={styles.copy}>상대가 내 동선을 열람한 사실을 어떻게 알릴까요?</span>
          </span>
          <div className={styles.radios} role="radiogroup" aria-label="제공 사실 통보 방식">
            <label className={styles.radio}>
              <input
                type="radio"
                name="notify-mode"
                checked={c.notifyMode === 'IMMEDIATE'}
                onChange={() =>
                  c.grant('NOTIFY_METHOD', { notifyMode: 'IMMEDIATE', shownTextHash: hashFor('NOTIFY_METHOD') })
                }
              />
              즉시 알림
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="notify-mode"
                checked={c.notifyMode === 'BATCHED_30D'}
                onChange={() =>
                  c.grant('NOTIFY_METHOD', { notifyMode: 'BATCHED_30D', shownTextHash: hashFor('NOTIFY_METHOD') })
                }
              />
              30일 묶음 알림
            </label>
          </div>
        </li>
      </ul>

      <p className={styles.reserve}>
        위 동의 중 일부를 <strong>유보</strong>해도 됩니다. 동의는 '우리' 탭에서 언제든 철회할 수 있어요.
      </p>

      <Button variant="primary" className={styles.close} onClick={onClose}>
        닫기
      </Button>
    </Dialog>
  )
}
