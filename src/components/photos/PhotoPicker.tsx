import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useUploadPhoto } from '@/hooks/usePhotos'
import styles from './PhotoPicker.module.css'

// 사진 올리기 — <input type="file">.
//
// Capacitor 카메라 플러그인을 넣지 않은 이유: WKWebView에서 file input의 accept/capture가
// 이미 네이티브 시트(사진 보관함·카메라)를 띄운다. 네이티브 의존을 하나 더 지고 웹 빌드에서
// 갈라지느니, 두 곳에서 똑같이 도는 표준 경로를 쓴다.
export function PhotoPicker({
  coupleId,
  myId,
  placeId,
  tripId,
  label = '사진 추가',
}: {
  coupleId: string | null
  myId: string | null
  placeId?: string | null
  tripId?: string | null
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadPhoto(coupleId, myId)
  const [error, setError] = useState<string | null>(null)

  const onPick = (files: FileList | null) => {
    setError(null)
    if (!files) return
    // 여러 장을 골라도 한 장씩 올린다 — 하나가 실패해도 나머지는 남는다.
    for (const file of Array.from(files)) {
      upload.mutate({ file, placeId, tripId }, { onError: (e) => setError(e.message) })
    }
    if (inputRef.current) inputRef.current.value = '' // 같은 파일을 다시 골라도 change가 나게
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
      >
        <Icon name="camera" /> {upload.isPending ? '올리는 중…' : label}
      </button>
      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => onPick(e.target.files)}
        aria-label={label}
      />
      {/* 실패는 삼키지 않는다 — 인라인으로 말하고 다시 시도할 수 있게 둔다(§7 에러 상태). */}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
