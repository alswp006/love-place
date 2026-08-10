import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCouple } from '@/hooks/useCouple'
import {
  useCreateInvite,
  useAcceptInvite,
  inviteReasonMessage,
} from '@/hooks/useCoupleInvite'
import {
  extractInviteCode,
  formatInviteCode,
  isValidInviteCode,
  inviteShareText,
} from '@/lib/inviteCode'
import { useToast } from '@/components/common/ToastProvider'
import { RouteFallback } from '@/components/common/RouteFallback'
import { ValuePreview } from '@/components/onboarding/ValuePreview'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import styles from './ConnectPage.module.css'
import { useAppReady } from '@/hooks/useAppReady'

// 💑 커플 연결 — 내 코드 만들기/공유 + 상대 코드 입력.
//
// 더 이상 로그인 직후의 관문이 아니다(0024). 혼자 쓰다가 우리 탭에서 '상대 연결하기'로 온다.
// 그래서 **되돌아갈 길**이 반드시 있어야 한다 — 연결은 선택이지 통과 조건이 아니다.
export default function ConnectPage() {
  useAppReady() // 연결 화면이 떴다 = 스플래시를 걷을 시점(lib/native/splash.ts)
  const navigate = useNavigate()
  const toast = useToast()
  const { data: couple, isLoading } = useCouple()
  const createInvite = useCreateInvite()
  const acceptInvite = useAcceptInvite()

  const [myCode, setMyCode] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  // 이미 발급해 둔 코드가 있으면 그대로 보여준다(로컬 state 유실 복구).
  // 예전엔 여기서 create_invite를 **자동 호출**했는데, 연결이 관문이 아니게 된 지금은
  // 화면을 열기만 해도 코드가 발급되는 셈이라 부작용이다. 조회한 값을 쓴다.
  useEffect(() => {
    if (couple?.inviteCode && !myCode) setMyCode(couple.inviteCode)
  }, [couple?.inviteCode, myCode])

  if (isLoading) return <RouteFallback />

  const onCreate = () => {
    setCreateError(null)
    createInvite.mutate(undefined, {
      onSuccess: (r) => {
        if (r.ok) setMyCode(r.code)
        else setCreateError(inviteReasonMessage(r.reason))
      },
      onError: () => setCreateError('일시적인 오류예요. 잠시 후 다시 시도해 주세요.'),
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
      toast.show('초대 문구를 복사했어요. 상대에게 붙여넣어 보내주세요.')
    }
  }

  const onAccept = (code: string) => {
    setAcceptError(null)
    acceptInvite.mutate(code, {
      onSuccess: (r) => {
        // 연결=공유 기본값(§1) — 동의 단계 없이 곧장 앱으로(가드도 보내지만 / 플래시 방지).
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
        <p className={styles.subtitle}>
          지금까지 혼자 담아둔 장소·일정은 연결하면 그대로 둘의 것이 돼요.
        </p>

        {/* 아직 상대가 없을 때만 '둘이 쓰면 이렇게' 미리보기(spec R3). 연결되면 가드가 앱으로 보낸다. */}
        {!couple?.partner && <ValuePreview />}

        {/* A. 내 코드 만들기 / 공유 */}
        <section className={styles.section} aria-label="내 초대 코드">
          <h2 className={styles.sectionTitle}>① 내 코드 만들어 보내기</h2>
          {myCode ? (
            <div className={styles.codeBox}>
              <div className={styles.code} aria-label={`내 초대 코드 ${formatInviteCode(myCode)}`}>
                {formatInviteCode(myCode)}
              </div>
              <p className={styles.codeHint}>48시간 안에 상대가 입력하면 연결돼요.</p>
              <Button variant="ghost" className={styles.shareBtn} onClick={() => void onShare()}>
                카톡·메시지로 공유하기
              </Button>
            </div>
          ) : (
            <Button
              variant="cta"
              className={styles.primaryBtn}
              onClick={onCreate}
              disabled={createInvite.isPending}
            >
              {createInvite.isPending ? '만드는 중…' : '초대 코드 만들기'}
            </Button>
          )}
          {createError ? (
            <p id="create-error" className={styles.error} role="alert">
              {createError}
            </p>
          ) : null}
        </section>

        <div className={styles.divider}>
          <span>또는</span>
        </div>

        {/* B. 상대 코드 입력 */}
        <section className={styles.section} aria-label="상대 코드 입력">
          <h2 className={styles.sectionTitle}>② 상대 코드 입력하기</h2>
          <Field
            className={styles.inputField}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="ABCD-2345"
            value={formatInviteCode(input)}
            onChange={(e) => {
              const raw = e.target.value
              setAcceptError(null)
              const found = extractInviteCode(raw)
              if (found) {
                setInput(found)
                onAccept(found)
              } else {
                setInput(raw)
              }
            }}
            aria-label="초대 코드 입력"
            aria-describedby={acceptError ? 'accept-error' : undefined}
          />
          {acceptError ? (
            <p id="accept-error" className={styles.error} role="alert">
              {acceptError}
            </p>
          ) : null}
          <Button
            variant="cta"
            className={styles.primaryBtn}
            onClick={() => onAccept(input)}
            disabled={!isValidInviteCode(input) || acceptInvite.isPending}
          >
            {acceptInvite.isPending ? '연결 중…' : '연결하기'}
          </Button>
        </section>

        {myCode ? (
          <p className={styles.waiting}>상대가 코드를 입력하면 자동으로 연결돼요.</p>
        ) : null}

        {/* 되돌아갈 길 — 연결은 선택이다. 이게 없으면 혼자 쓰는 사람이 이 화면에 갇힌다. */}
        {couple?.isSolo ? (
          <Button variant="ghost" className={styles.laterBtn} onClick={() => navigate('/')}>
            나중에 할게요
          </Button>
        ) : null}
      </div>
    </main>
  )
}
