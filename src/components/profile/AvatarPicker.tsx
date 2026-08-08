import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/common/Dialog'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useAvatarUpload } from '@/hooks/useAvatarUpload'
import { useToast } from '@/hooks/useToast'
import {
  IDENTITY_CROP,
  MAX_ZOOM,
  MIN_ZOOM,
  decode,
  panBy,
  previewLayout,
  type CropTransform,
} from '@/lib/photos/avatar'
import styles from './AvatarPicker.module.css'

// 프로필 사진 — 고르기 → 위치·크기 맞추기 → 저장.
//
// 왜 크롭을 두나: 아바타는 앱 곳곳에서 **원**으로 그려진다(마커 12px ~ 우리 탭 48px).
// 자동 중앙 크롭에만 맡기면 얼굴이 반쯤 잘리는 사진이 흔하고, 사용자가 고칠 방법이 없다.
//
// 접근성: 끌기는 발견성이 낮고 손 떨림에 약하다 → **방향키로도 같은 조작**이 되고(스테이지 포커스),
// 확대는 range 입력(키보드 가능), '가운데로' 버튼으로 언제든 초기화된다(ux §1 제스처 대체 경로).

const FRAME = 260 // 크롭 스테이지 한 변(px) — 미리보기 배치 계산 기준
const KEY_STEP = 12 // 방향키 한 번에 움직일 픽셀

type Props = {
  coupleId: string | null
  userId: string | null
  /** 현재 표시 중인 서명 URL(없으면 이니셜 폴백) */
  currentUrl: string | null
  /** 현재 Storage 경로(교체·삭제 대상) */
  currentPath: string | null
  /** 이니셜 폴백에 쓸 이름·색 */
  displayName: string
  color: string
  /** 낙관적 락용 */
  version: number
}

export function AvatarPicker({
  coupleId,
  userId,
  currentUrl,
  currentPath,
  displayName,
  color,
  version,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { upload, remove, isPending } = useAvatarUpload(coupleId, userId)
  const toast = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<CropTransform>(IDENTITY_CROP)
  const [error, setError] = useState<string | null>(null)

  // 고른 파일을 미리보기로 — 원본 크기를 알아야 크롭 계산이 선다.
  useEffect(() => {
    if (!file) return
    let alive = true
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    void (async () => {
      try {
        const { w, h, close } = await decode(file)
        close()
        if (alive) setDims({ w, h })
      } catch {
        if (alive) setError('이 사진은 읽지 못했어요. 다른 사진을 골라주세요.')
      }
    })()
    return () => {
      alive = false
      URL.revokeObjectURL(url)
    }
  }, [file])

  const close = () => {
    setFile(null)
    setObjectUrl(null)
    setDims(null)
    setCrop(IDENTITY_CROP)
    setError(null)
  }

  const onPick = (list: FileList | null) => {
    setError(null)
    const f = list?.[0]
    if (inputRef.current) inputRef.current.value = '' // 같은 파일 재선택도 change가 나게
    if (!f) return
    setCrop(IDENTITY_CROP)
    setFile(f)
  }

  // ── 끌어서 이동 (포인터 이벤트 = 마우스·터치·펜 공통)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (!dims) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId || !dims) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    drag.current = { ...d, x: e.clientX, y: e.clientY }
    setCrop((c) => panBy(dims.w, dims.h, c, dx, dy, FRAME))
  }
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  // ── 방향키로 같은 이동 (끌기 대체 경로)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!dims) return
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    }
    const delta = map[e.key]
    if (!delta) return
    e.preventDefault()
    setCrop((c) => panBy(dims.w, dims.h, c, delta[0], delta[1], FRAME))
  }

  const onSave = async () => {
    if (!file) return
    setError(null)
    try {
      await upload({ file, transform: crop, expectedVersion: version, previousPath: currentPath })
      toast.show('프로필 사진을 저장했어요')
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했어요.')
    }
  }

  const onRemove = async () => {
    setError(null)
    try {
      await remove({ expectedVersion: version, previousPath: currentPath })
      toast.show('프로필 사진을 지웠어요')
    } catch (e) {
      setError(e instanceof Error ? e.message : '지우지 못했어요.')
    }
  }

  const initial = displayName.trim().slice(0, 1).toUpperCase() || '나'
  const layout = dims ? previewLayout(dims.w, dims.h, crop, FRAME) : null

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        {/* 현재 사진. 없으면 이니셜+색 — 색만으로 구분하지 않게 글자를 함께 둔다(§8). */}
        {currentUrl ? (
          <img className={styles.current} src={currentUrl} alt="현재 프로필 사진" />
        ) : (
          <div className={styles.current} style={{ background: color }} aria-hidden>
            {initial}
          </div>
        )}
        <div className={styles.actions}>
          <Button
            variant="ghost"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isPending}
          >
            <Icon name="camera" /> {currentPath ? '사진 바꾸기' : '사진 고르기'}
          </Button>
          {currentPath ? (
            <Button variant="ghost" type="button" onClick={() => void onRemove()} disabled={isPending}>
              지우기
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        accept="image/*"
        onChange={(e) => onPick(e.target.files)}
        aria-label="프로필 사진 파일 선택"
      />

      {error && !file ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <Dialog open={Boolean(file)} onClose={close} ariaLabel="프로필 사진 맞추기" className={styles.sheet}>
        <h2 className={styles.title}>사진 맞추기</h2>
        <p className={styles.hint}>끌어서 옮기고, 아래 막대로 크기를 맞춰요. 방향키로도 옮길 수 있어요.</p>

        <div
          ref={stageRef}
          className={styles.stage}
          style={{ width: FRAME, height: FRAME }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          tabIndex={0}
          role="group"
          aria-label="사진 위치 조정 — 방향키로 옮길 수 있어요"
        >
          {objectUrl && layout ? (
            <img
              className={styles.stageImg}
              src={objectUrl}
              alt=""
              draggable={false}
              style={{
                width: layout.width,
                height: layout.height,
                left: layout.left,
                top: layout.top,
              }}
            />
          ) : (
            <div className={styles.stageLoading} aria-busy="true" />
          )}
          {/* 원형 마스크 — 실제로 저장되는 건 정사각이지만, 앱에서 원으로 보이니 그대로 보여준다. */}
          <div className={styles.mask} aria-hidden />
        </div>

        <label className={styles.zoom}>
          <span className={styles.zoomLabel}>크기</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            onChange={(e) => setCrop((c) => ({ ...c, zoom: Number(e.target.value) }))}
            aria-label="사진 크기"
          />
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.sheetActions}>
          <Button variant="ghost" type="button" onClick={() => setCrop(IDENTITY_CROP)} disabled={isPending}>
            가운데로
          </Button>
          <Button variant="ghost" type="button" onClick={close} disabled={isPending}>
            취소
          </Button>
          <Button variant="primary" type="button" onClick={() => void onSave()} disabled={isPending || !dims}>
            {isPending ? '저장 중…' : '저장'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
