import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { useSignInWithOtp } from '@/hooks/useSignInWithOtp'
import { useSignInWithGoogle } from '@/hooks/useSignInWithGoogle'
import { useSignInWithApple } from '@/hooks/useSignInWithApple'
import { useSignInWithPassword } from '@/hooks/useSignInWithPassword'
import { useResendCooldown } from '@/hooks/useResendCooldown'
import { GoogleIcon } from '@/components/auth/GoogleIcon'
import { Button } from '@/components/ui/Button'
import { isNativePlatform } from '@/lib/platform'
import styles from './LoginPage.module.css'
import { useAppReady } from '@/hooks/useAppReady'

// 로그인 화면(§10.3). 구글(권장, 메일 한도 없음) + 이메일 매직링크.
export default function LoginPage() {
  useAppReady() // 로그인 화면이 떴다 = 스플래시를 걷을 시점(lib/native/splash.ts)
  const { initializing, session, configured } = useAuth()
  const { status, error, sendMagicLink, verifyCode, reset } = useSignInWithOtp()
  const google = useSignInWithGoogle()
  const apple = useSignInWithApple()
  const pw = useSignInWithPassword()
  const cooldown = useResendCooldown()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  // 네이티브(Capacitor)에선 매직링크가 외부 브라우저로 열려 PKCE가 끊기므로, 발송 후 6자리 코드 입력을 1차로 안내.
  const native = isNativePlatform()

  // 메일 발송 성공(sent) 진입 시 재전송 쿨다운 30초 시작(R3.6). 한 번만 발사.
  const wasSent = useRef(false)
  useEffect(() => {
    if (status === 'sent' && !wasSent.current) {
      wasSent.current = true
      cooldown.start(30)
    }
    if (status !== 'sent') wasSent.current = false
  }, [status, cooldown])

  // 이미 로그인돼 있으면 앱으로.
  if (!initializing && session) return <Navigate to="/" replace />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void sendMagicLink(email)
  }

  const onResend = () => {
    if (!cooldown.canResend) return
    void sendMagicLink(email)
    cooldown.start(30)
  }

  const onVerify = (e: FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    void Promise.resolve(verifyCode(email, code)).finally(() => setVerifying(false))
  }

  const onPwSubmit = (e: FormEvent) => {
    e.preventDefault()
    void pw.signIn(email, password)
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        {/* 이모지 대신 실제 앱 마크 — 로그인은 앱의 첫인상이고, 홈 화면 아이콘과 같은 그림이어야
            "그 앱"으로 이어진다. */}
        <img className={styles.logo} src="/brand-mark.svg" alt="" aria-hidden />
        <h1 className={styles.title}>Weave</h1>
        <p className={styles.subtitle}>둘만의 여행을 기록해요</p>

        {!configured ? (
          <div className={styles.notice} role="alert">
            아직 서버 연결 전이에요. (개발 중 — 곧 켜집니다)
          </div>
        ) : status === 'sent' ? (
          <div className={styles.sent} role="status" aria-live="polite">
            <p className={styles.sentTitle}>{native ? '🔑 코드를 입력하세요' : '📬 메일을 확인하세요'}</p>
            <p className={styles.sentHint}>
              {native ? (
                <>
                  메일로 받은 <strong>6자리 코드</strong>를 입력해 로그인하세요.
                </>
              ) : (
                <>
                  <strong>{email}</strong> 으로 로그인 링크를 보냈어요.
                  <br />
                  메일의 링크를 누르면 로그인됩니다.
                </>
              )}
            </p>

            {/* 6자리 코드 폴백 — 메일이 다른 브라우저에서 열렸을 때 같은 화면에서 로그인(PKCE 교차컨텍스트 완화, dossier 01 §6) */}
            <form className={styles.form} onSubmit={onVerify}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                className={styles.input}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-label="6자리 코드"
              />
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" variant="cta" className={styles.submit} disabled={verifying}>
                {verifying ? '로그인 중…' : '코드로 로그인'}
              </Button>
            </form>
            <p className={styles.sentHint}>
              메일이 다른 브라우저에서 열렸다면, 이 화면에 6자리 코드를 입력해 같은 곳에서
              로그인하세요.
            </p>

            <button
              type="button"
              className={styles.linkBtn}
              onClick={onResend}
              disabled={!cooldown.canResend}
            >
              {cooldown.canResend ? '다시 보내기' : `다시 보내기 (${cooldown.remaining}초)`}
            </button>
            <button type="button" className={styles.linkBtn} onClick={reset}>
              다른 이메일로 다시 보내기
            </button>
          </div>
        ) : (
          <>
            {/* Apple 로그인(App Store 4.8 — 제3자 소셜 제공 시 동등 옵션). 메일 발송 없이 즉시. */}
            <button
              type="button"
              className={styles.appleBtn}
              onClick={() => void apple.signIn()}
              disabled={apple.loading}
            >
              <span>{apple.loading ? 'Apple로 이동 중…' : 'Apple로 계속하기'}</span>
            </button>
            {apple.error ? (
              <p className={styles.error} role="alert">
                {apple.error}
              </p>
            ) : null}

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
              <Button type="submit" variant="cta" className={styles.submit} disabled={status === 'sending'}>
                {status === 'sending' ? '보내는 중…' : '로그인 링크 받기'}
              </Button>
            </form>

            {/* 비밀번호 로그인 — **운영 빌드에도 남긴다.**
                이유: 로그인이 필요한 앱은 심사에 데모 계정을 제공해야 하는데, 매직링크·OTP는
                우리 메일함으로 가고 소셜 로그인은 심사관 계정이 커플에 묶이지 않는다.
                즉 이게 없으면 심사관이 앱에 들어올 방법이 없어 그 자리에서 반려된다.
                실사용자를 헷갈리게 하지 않도록 접어 두고, 눌러야 열린다. */}
            <details className={styles.pwDisclosure}>
              <summary className={styles.pwSummary}>비밀번호로 로그인</summary>
              <form
                className={styles.form}
                onSubmit={onPwSubmit}
                aria-label="비밀번호로 로그인"
                data-testid="dev-password-login"
              >
                <input
                  type="password"
                  autoComplete="current-password"
                  className={styles.input}
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="비밀번호"
                  data-testid="dev-password-input"
                />
                {pw.error ? (
                  <p className={styles.error} role="alert">
                    {pw.error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  variant="cta"
                  className={styles.submit}
                  disabled={pw.status === 'signing'}
                  data-testid="dev-password-submit"
                >
                  {pw.status === 'signing' ? '로그인 중…' : '로그인'}
                </Button>
              </form>
            </details>
          </>
        )}
      </div>
    </main>
  )
}
