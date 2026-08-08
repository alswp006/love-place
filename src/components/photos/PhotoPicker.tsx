import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useUploadPhoto } from '@/hooks/usePhotos'
import styles from './PhotoPicker.module.css'

// 사진 올리기 — <input type="file">.
//
// Capacitor 카메라 플러그인을 넣지 않은 이유: WKWebView에서 file input의 accept/capture가
// 이미 네이티브 시트(사진 보관함·카메라)를 띄운다. 네이티브 의존을 하나 더 지고 웹 빌드에서
// 갈라지느니, 두 곳에서 똑같이 도는 표준 경로를 쓴다.
//
// ⚠️ 여러 장은 **한 장씩 차례로** 올린다. 예전엔 루프에서 mutate를 연달아 불렀는데 그러면
//   1) TanStack Query가 이전 mutation에서 옵저버를 떼어 마지막 것 외의 onError가 영영 안 오고
//      (= 실패가 무음), 2) isPending이 마지막 것만 추적해 버튼이 먼저 풀리고,
//   3) 원본 해상도 ImageBitmap이 파일 수만큼 동시에 상주해(12MP×12장 ≈ 580MB) 웹뷰가 죽었다.

/** 한 번에 고를 수 있는 장수 상한 — 넘으면 앞에서부터 자르고 그렇게 말한다. */
const MAX_AT_ONCE = 20

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const onPick = async (fileList: FileList | null) => {
    setError(null)
    if (!fileList || fileList.length === 0) return
    const all = Array.from(fileList)
    const files = all.slice(0, MAX_AT_ONCE)
    if (inputRef.current) inputRef.current.value = '' // 같은 파일을 다시 골라도 change가 나게

    const failed: string[] = []
    setProgress({ done: 0, total: files.length })
    for (const [i, file] of files.entries()) {
      try {
        await upload.mutateAsync({ file, placeId, tripId })
      } catch (e) {
        // 한 장이 실패해도 나머지는 계속 올린다 — 실패한 것만 이름과 함께 모아 한 번에 알린다.
        failed.push(file.name)
        void e
      }
      setProgress({ done: i + 1, total: files.length })
    }
    setProgress(null)

    const parts: string[] = []
    if (all.length > files.length) parts.push(`한 번에 ${MAX_AT_ONCE}장까지 올려요`)
    if (failed.length) parts.push(`못 올린 사진 ${failed.length}장: ${failed.join(', ')}`)
    setError(parts.length ? parts.join(' · ') : null)
  }

  const busy = progress !== null
  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        <Icon name="camera" />{' '}
        {busy ? `올리는 중 ${progress.done}/${progress.total}` : label}
      </button>
      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void onPick(e.target.files)}
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
