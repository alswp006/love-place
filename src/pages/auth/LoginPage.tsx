import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { useSignInWithOtp } from '@/hooks/useSignInWithOtp'
import { useSignInWithGoogle } from '@/hooks/useSignInWithGoogle'
import { GoogleIcon } from '@/components/auth/GoogleIcon'
import styles from './LoginPage.module.css'

// 로그인 화면(§10.3). 구글(권장, 메일 한도 없음) + 이메일 매직링크.
export default function LoginPage() {
  const { initializing, session, configured } = useAuth()
  const { status, error, sendMagicLink, reset } = useSignInWithOtp()
  const google = useSignInWithGoogle()
  const [email, setEmail] = useState('')

  // 이미 로그인돼 있으면 앱으로.
  if (!initializing && session) return <Navigate to="/" replace />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void sendMagicLink(email)
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logo} aria-hidden>
          💑
        </div>
        <h1 className={styles.title}>love place</h1>
        <p className={styles.subtitle}>둘만의 여행을 기록해요</p>

        {!configured ? (
          <div className={styles.notice} role="alert">
            아직 서버 연결 전이에요. (개발 중 — 곧 켜집니다)
          </div>
        ) : status === 'sent' ? (
          <div className={styles.sent} role="status" aria-live="polite">
            <p className={styles.sentTitle}>📬 메일을 확인하세요</p>
            <p className={styles.sentHint}>
              <strong>{email}</strong> 으로 로그인 링크를 보냈어요.
              <br />
              메일의 링크를 누르면 로그인됩니다.
            </p>
            <button type="button" className={styles.linkBtn} onClick={reset}>
              다른 이메일로 다시 보내기
            </button>
          </div>
        ) : (
          <>
            {/* 구글 로그인(권장) — 메일 발송 없어 즉시 로그인 */}
            <button
              type="button"
              className={styles.googleBtn}
              onClick={() => void google.signIn()}
              disabled={google.loading}
            >
              <GoogleIcon />
              <span>{google.loading ? '구글로 이동 중…' : '구글로 계속하기'}</span>
            </button>
            {google.error ? (
              <p className={styles.error} role="alert">
                {google.error}
              </p>
            ) : null}

            <div className={styles.divider}>
              <span>또는 이메일로</span>
            </div>

            {/* 이메일 매직링크(보조) */}
            <form className={styles.form} onSubmit={onSubmit}>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="이메일"
                aria-describedby={error ? 'login-error' : undefined}
              />
              {error ? (
                <p id="login-error" className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className={styles.submit} disabled={status === 'sending'}>
                {status === 'sending' ? '보내는 중…' : '로그인 링크 받기'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
