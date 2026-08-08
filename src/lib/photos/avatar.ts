// 프로필 사진 크롭 — 원본에서 잘라낼 **정사각 영역**을 정하는 순수 계산 + 실제 인코딩.
//
// 왜 정사각인가: 아바타는 앱 곳곳에서 원으로 그려진다(지도 마커 12px ~ 우리 탭 48px).
// object-fit: cover로 브라우저에 맡기면 화면마다 잘리는 위치가 달라지고, 무엇보다
// **사용자가 얼굴 위치를 정할 수 없다.** 그래서 올릴 때 한 번 잘라 정사각으로 저장한다.
//
// 미리보기(CSS)와 결과물(canvas)이 어긋나면 "보이는 것과 다른 게 저장되는" 최악의 버그가 된다.
// 그래서 둘 다 아래 sourceSquare() 하나에서 나온다 — 미리보기는 그 값으로 위치를 잡고,
// 인코딩은 그 값으로 drawImage한다.

import { encodeCanvas, extOf } from './resize'

/** 아바타 한 변(px). 원으로 22~48px에 그려지고 레티나 3배까지 감당하면 충분하다. */
export const AVATAR_SIZE = 256

export type CropTransform = {
  /** 1 = 짧은 변 전체(중앙 크롭), 클수록 확대. */
  zoom: number
  /** -1 ~ 1. 0이 중앙, ±1이 원본 가장자리. 정사각 원본이면 이 축은 움직일 여지가 없다. */
  panX: number
  panY: number
}

export const IDENTITY_CROP: CropTransform = { zoom: 1, panX: 0, panY: 0 }

export const MIN_ZOOM = 1
export const MAX_ZOOM = 3

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * 원본(w×h)에서 잘라낼 정사각 영역.
 *
 * zoom은 [1,3]으로, pan은 [-1,1]로 조인다 — 프레임 밖으로 나가 빈 여백이 생기는 상태를
 * 애초에 만들 수 없게 한다(잘라낸 결과에 투명 구멍이 나는 것보다 조이는 게 낫다).
 */
export function sourceSquare(
  w: number,
  h: number,
  t: CropTransform,
): { sx: number; sy: number; size: number } {
  const base = Math.min(w, h)
  if (!(base > 0)) return { sx: 0, sy: 0, size: 0 }
  const zoom = clamp(Number.isFinite(t.zoom) ? t.zoom : 1, MIN_ZOOM, MAX_ZOOM)
  const size = base / zoom
  const maxDx = (w - size) / 2
  const maxDy = (h - size) / 2
  const panX = clamp(Number.isFinite(t.panX) ? t.panX : 0, -1, 1)
  const panY = clamp(Number.isFinite(t.panY) ? t.panY : 0, -1, 1)
  return {
    sx: clamp((w - size) / 2 + panX * maxDx, 0, w - size),
    sy: clamp((h - size) / 2 + panY * maxDy, 0, h - size),
    size,
  }
}

/**
 * 미리보기 배치 — 한 변이 frame인 사각형 안에서 이미지를 어디에 얼마나 크게 놓을지.
 * 결과물과 **같은 sourceSquare**에서 나오므로 보이는 그대로 저장된다.
 */
export function previewLayout(
  w: number,
  h: number,
  t: CropTransform,
  frame: number,
): { width: number; height: number; left: number; top: number } {
  const { sx, sy, size } = sourceSquare(w, h, t)
  if (!(size > 0)) return { width: frame, height: frame, left: 0, top: 0 }
  const k = frame / size
  return { width: w * k, height: h * k, left: -sx * k, top: -sy * k }
}

/**
 * 프레임 안에서 dx/dy(px)만큼 끌었을 때의 새 pan.
 * 움직일 여지가 없는 축(정사각 원본의 두 축, 세로 사진의 가로축)은 그대로 둔다 — 0으로 나누지 않는다.
 */
export function panBy(
  w: number,
  h: number,
  t: CropTransform,
  dxPx: number,
  dyPx: number,
  frame: number,
): CropTransform {
  const { size } = sourceSquare(w, h, t)
  if (!(size > 0) || !(frame > 0)) return t
  const k = frame / size
  const maxDx = (w - size) / 2
  const maxDy = (h - size) / 2
  // 손가락이 오른쪽으로 가면 이미지가 오른쪽으로 → 잘라내는 창은 왼쪽으로 간다(부호 반대).
  const nextX = maxDx > 0 ? clamp(t.panX - dxPx / k / maxDx, -1, 1) : t.panX
  const nextY = maxDy > 0 ? clamp(t.panY - dyPx / k / maxDy, -1, 1) : t.panY
  return { ...t, panX: nextX, panY: nextY }
}

/** 파일 + 크롭 → 정사각 아바타 blob. 확장자는 실제 MIME에서 뽑는다(경로가 내용과 어긋나지 않게). */
export async function cropAvatar(
  file: File,
  t: CropTransform,
  size = AVATAR_SIZE,
): Promise<{ blob: Blob; ext: string }> {
  const { source, w, h, close } = await decode(file)
  try {
    const { sx, sy, size: ssize } = sourceSquare(w, h, t)
    if (!(ssize > 0)) throw new Error('이미지를 읽지 못했어요.')
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('이미지를 처리하지 못했어요.')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, sx, sy, ssize, ssize, 0, 0, size, size)
    const blob = await encodeCanvas(canvas, 0.9)
    return { blob, ext: extOf(blob) }
  } finally {
    close()
  }
}

/** 파일 → 그릴 수 있는 소스 + 원본 크기. resize.ts와 같은 규칙(EXIF 회전 적용, 비트맵 반드시 닫기). */
export async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image()
      el.onload = () => res(el)
      el.onerror = () => rej(new Error('이미지를 읽지 못했어요.'))
      el.src = url
    })
    return { source: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}
