import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCouple } from '@/hooks/useCouple'
import { useMyProfile } from '@/hooks/useMyProfile'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useConsent, useUpdateConsent } from '@/hooks/useConsent'
import { ColorPicker } from '@/components/profile/ColorPicker'
import { defaultColorForRole } from '@/lib/profileColor'
import { RouteFallback } from '@/components/common/RouteFallback'
import styles from './OnboardingSteps.module.css'

// 온보딩 ②색상 ③위치·사진 상호동의 위저드(설계서 §7 3스텝 중 ②③; ①은 연결 자체).
// 가드(RequireAuth, T8a)가 ACTIVE+동의 미기록인 두 파트너 모두를 이 화면으로 보낸다.
export function OnboardingSteps() {
  const navigate = useNavigate()
  const { data: couple } = useCouple()
  const myRole = couple?.myRole ?? 'user_a' // 공유 필드(T6) — useAuth로 재도출하지 않음.
  const { data: profile, isLoading: profileLoading } = useMyProfile()
  const { isLoading: consentLoading } = useConsent()
  const { updateProfile, isPending: savingColor, error: colorError } = useUpdateProfile(couple?.coupleId ?? null)
  const { updateConsent, isPending: savingConsent, error: consentError } = useUpdateConsent()

  const [step, setStep] = useState<2 | 3>(2)
  const [color, setColor] = useState<string>(defaultColorForRole(myRole))
  const [locationOk, setLocationOk] = useState(false)
  const [photoOk, setPhotoOk] = useState(false)

  // 색 시드: 서버 행에 색이 있으면 그걸, 없으면 역할 기본색.
  useEffect(() => {
    if (profile) setColor(profile.color || defaultColorForRole(myRole))
  }, [profile, myRole])

  // 콜드스타트/로딩 — 빈 화면 금지(§8). 프로필·동의 행이 도착할 때까지 폴백.
  if (profileLoading || consentLoading || !profile) return <RouteFallback />

  const onNext = async () => {
    try {
      await updateProfile({ color, expectedVersion: profile.version })
      setStep(3)
    } catch {
      /* 에러는 colorError로 표시 */
    }
  }

  const onFinish = async () => {
    try {
      // version은 ② 저장에서 +1 됐으므로 최신값으로 동의 기록.
      await updateConsent({ expectedVersion: profile.version + 1 })
      navigate('/', { replace: true })
    } catch {
      /* 에러는 consentError로 표시 */
    }
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.progress} aria-label={`온보딩 진행 ${step}/3`}>
          {step}/3
        </p>

        {step === 2 ? (
          <section className={styles.section} aria-label="내 캘린더 색 고르기">
            <h1 className={styles.title}>내 색을 골라요</h1>
            <p className={styles.subtitle}>
              캘린더·지도에서 나를 나타낼 색이에요. 색은 이름 라벨과 함께 표시돼요.
            </p>
            <ColorPicker value={color} onChange={setColor} />
            {colorError ? (
              <p className={styles.error} role="alert">
                {colorError.message}
              </p>
            ) : null}
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void onNext()}
              disabled={savingColor}
            >
              {savingColor ? '저장 중…' : '다음'}
            </button>
          </section>
        ) : (
          <section className={styles.section} aria-label="상호 동의">
            <h1 className={styles.title}>서로의 데이터를 함께 봐요</h1>
            <p className={styles.subtitle}>
              둘만의 도구예요. 서로의 위치와 사진을 공유·표시하려면 두 가지 동의가 필요해요.
            </p>

            <label className={styles.consentRow}>
              <input
                type="checkbox"
                checked={locationOk}
                onChange={(e) => setLocationOk(e.target.checked)}
              />
              <span className={styles.consentText}>
                <span className={styles.consentTitle}>위치 공유</span>
                <span className={styles.consentDesc}>서로의 위치 정보를 공유·표시하는 데 동의해요.</span>
              </span>
            </label>

            <label className={styles.consentRow}>
              <input
                type="checkbox"
                checked={photoOk}
                onChange={(e) => setPhotoOk(e.target.checked)}
              />
              <span className={styles.consentText}>
                <span className={styles.consentTitle}>사진 공유</span>
                <span className={styles.consentDesc}>서로 올린 사진을 공유 앨범에서 함께 보는 데 동의해요.</span>
              </span>
            </label>

            {consentError ? (
              <p className={styles.error} role="alert">
                {consentError.message}
              </p>
            ) : null}

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void onFinish()}
              disabled={!locationOk || !photoOk || savingConsent}
            >
              {savingConsent ? '기록 중…' : '시작하기'}
            </button>
          </section>
        )}
      </div>
    </main>
  )
}

export default OnboardingSteps
