import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { PlaceSearch } from '@/components/places/PlaceSearch'
import { useCouple } from '@/hooks/useCouple'
import { usePlaces } from '@/hooks/usePlaces'
import { useRealtimePlaces } from '@/hooks/useRealtimePlaces'
import { tabByPath } from '@/app/tabs'
import styles from './PlacesPage.module.css'

// 📍 장소 — 카카오 검색으로 가고싶은 곳 저장 + 위시 목록(§5.2).
export default function PlacesPage() {
  const tab = tabByPath('/places')
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const { data: places, isLoading: placesLoading } = usePlaces(coupleId)
  useRealtimePlaces(coupleId) // 상대가 추가하면 즉시 반영

  // 아직 커플 연결 전이면 검색/저장이 무의미 → 연결 안내(§4.2).
  if (!coupleLoading && couple?.status !== 'ACTIVE') {
    return (
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <EmptyState
          emoji="💑"
          title="먼저 상대와 연결해요"
          hint="'우리' 탭에서 초대 코드로 연결하면, 둘이 함께 장소를 모을 수 있어요."
        />
      </ScreenScaffold>
    )
  }

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <div className={styles.container}>
        <PlaceSearch coupleId={coupleId} />

        <section className={styles.listSection} aria-label="가고싶은 장소 목록">
          {placesLoading ? (
            <p className={styles.loading}>불러오는 중…</p>
          ) : !places || places.length === 0 ? (
            <EmptyState
              emoji="📍"
              title="첫 가고싶은 장소를 추가해보세요"
              hint="위 검색창에 장소 이름을 입력하면 후보가 떠요."
            />
          ) : (
            <ul className={styles.list}>
              {places.map((p) => (
                <li key={p.id} className={styles.card}>
                  <div className={styles.cardMain}>
                    <span className={styles.cardName}>{p.name}</span>
                    {p.address ? <span className={styles.cardAddr}>{p.address}</span> : null}
                  </div>
                  {p.region_label ? <span className={styles.badge}>{p.region_label}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ScreenScaffold>
  )
}
