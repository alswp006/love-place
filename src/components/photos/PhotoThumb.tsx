import { useState } from 'react'
import styles from './PhotoThumb.module.css'

// 목록용 썸네일 한 장.
//
// 사진이 없으면 **아무것도 그리지 않는다**(회색 플레이스홀더 금지). 빈 회색 박스는 빈 화면보다
// 나쁘다 — 뭔가 실패한 것처럼 보이고, 목록의 리듬만 망친다. 그래서 이 컴포넌트는 url이 없으면
// 호출부에서 아예 렌더하지 않는 걸 전제로 한다.
//
// 로딩 중에는 은은한 톤만 깔고, 도착하면 블러업(§5.4) 없이 짧게 페이드한다.
export function PhotoThumb({
  url,
  alt,
  className,
}: {
  url: string
  /** 옆에 이름이 이미 있으면 빈 문자열 — 스크린리더에 같은 말을 두 번 들려주지 않는다. */
  alt: string
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <span className={className ? `${styles.wrap} ${className}` : styles.wrap}>
      <img
        className={loaded ? `${styles.img} ${styles.shown}` : styles.img}
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        /* 서명 URL이 만료됐거나 파일이 사라졌을 때 깨진 아이콘을 남기지 않는다. */
        onError={() => setFailed(true)}
      />
    </span>
  )
}
