import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCouple } from '@/hooks/useCouple'
import {
  useCreateInvite,
  useAcceptInvite,
  inviteReasonMessage,
} from '@/hooks/useCoupleInvite'
import { formatInviteCode, isValidInviteCode, inviteShareText } from '@/lib/inviteCode'
import { RouteFallback } from '@/components/common/RouteFallback'
import styles from './ConnectPage.module.css'

// 💑 커플 연결(온보딩) — 내 코드 만들기/공유 + 상대 코드 입력. 둘 다 미연결(가드) 상태에서만 도달.
export default function ConnectPage() {
  const navigate = useNavigate()
  const { data: couple, isLoading } = useCouple()
  const createInvite = useCreateInvite()
  const acceptInvite = useAcceptInvite()

  const [myCode, setMyCode] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [acceptError, setAcceptError] = useState<string | null>(null)

  if (isLoading) return <RouteFallback />

  const onCreate = () => {
    createInvite.mutate(undefined, {
      onSuccess: (r) => {
        if (r.ok) setMyCode(r.code)
        else setAcceptError(inviteReasonMessage(r.reason))
      },
    })
  }

  const onShare = async () => {
    if (!myCode) return
    const text = inviteShareText(myCode)
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch {
        /* 사용자가 취소 — 무시 */
      }
    } else {
      await navigator.clipboard.writeText(text)
      alert('초대 문구를 복사했어요. 상대에게 붙여넣어 보내주세요.')
    }
  }

  const onAccept = () => {
    setAcceptError(null)
    acceptInvite.mutate(input, {
      onSuccess: (r) => {
        if (r.ok) navigate('/', { replace: true })
        else setAcceptError(inviteReasonMessage(r.reason))
      },
      onError: () => setAcceptError('일시적인 오류예요. 잠시 후 다시 시도해 주세요.'),
    })
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logo} aria-hidden>
          💑
        </div>
        <h1 className={styles.title}>둘이 연결해요</h1>
        <p className={styles.subtitle}>한 명이 코드를 만들어 보내고, 다른 한 명이 입력하면 끝.</p>

        {/* A. 내 코드 만들기 / 공유 */}
        <section className={styles.section} aria-label="내 초대 코드">
          <h2 className={styles.sectionTitle}>① 내 코드 만들어 보내기</h2>
          {myCode ? (
            <div className={styles.codeBox}>
              <div className={styles.code} aria-label={`내 초대 코드 ${formatInviteCode(myCode)}`}>
                {formatInviteCode(myCode)}
              </div>
              <p className={styles.codeHint}>48시간 안에 상대가 입력하면 연결돼요.</p>
              <button className={styles.shareBtn} onClick={() => void onShare()}>
                카톡·메시지로 공유하기
              </button>
            </div>
          ) : (
            <button
              className={styles.primaryBtn}
              onClick={onCreate}
              disabled={createInvite.isPending}
            >
              {createInvite.isPending ? '만드는 중…' : '초대 코드 만들기'}
            </button>
          )}
        </section>

        <div className={styles.divider}>
          <span>또는</span>
        </div>

        {/* B. 상대 코드 입력 */}
        <section className={styles.section} aria-label="상대 코드 입력">
          <h2 className={styles.sectionTitle}>② 상대 코드 입력하기</h2>
          <input
            className={styles.input}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="ABCD-2345"
            value={formatInviteCode(input)}
            onChange={(e) => {
              setInput(e.target.value)
              setAcceptError(null)
            }}
            aria-label="초대 코드 입력"
            aria-describedby={acceptError ? 'accept-error' : undefined}
          />
          {acceptError ? (
            <p id="accept-error" className={styles.error} role="alert">
              {acceptError}
            </p>
          ) : null}
          <button
            className={styles.primaryBtn}
            onClick={onAccept}
            disabled={!isValidInviteCode(input) || acceptInvite.isPending}
          >
            {acceptInvite.isPending ? '연결 중…' : '연결하기'}
          </button>
        </section>

        {couple?.status === 'PENDING' ? (
          <p className={styles.waiting}>상대가 코드를 입력하면 자동으로 연결돼요.</p>
        ) : null}
      </div>
    </main>
  )
}
