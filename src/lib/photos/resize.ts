// 업로드 전 클라이언트 리사이즈.
//
// 왜 클라이언트에서 하나: 요즘 폰 사진은 한 장 4~8MB다. 원본을 그대로 올리면 이동 중 업로드가
// 실패하고, 목록에서 8MB짜리를 64px 썸네일로 그리느라 스크롤이 끊긴다. 올리기 전에 줄인다.
//
// 두 벌을 만든다:
//   - display: 긴 변 1600px — 상세에서 보기 충분하고, 나중에 발행 가공본의 원본이 된다.
//   - thumb:   긴 변 400px  — 목록·그리드용.
// 원본을 보관하지 않는 이유: 이 앱은 사진 보관함이 아니라 기록이고, 관계 종료 시 내보내기(§5.2)에
// 필요한 건 '우리가 본 그 사진'이다. 원본까지 두면 저장·비용·업로드 실패가 같이 늘어난다.

export type ResizedPhoto = {
  display: Blob
  thumb: Blob
  width: number
  height: number
}

const DISPLAY_MAX = 1600
const THUMB_MAX = 400

/** 긴 변을 max에 맞춘 크기. 원본이 더 작으면 키우지 않는다(흐려지기만 한다). */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h)
  if (longest <= max) return { w, h }
  const k = max / longest
  return { w: Math.round(w * k), h: Math.round(h * k) }
}

async function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  // webp는 같은 화질에서 jpeg보다 훨씬 작다. Safari 14+/Chrome 전부 지원.
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality))
  if (blob) return blob
  const jpeg = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
  if (!jpeg) throw new Error('이미지를 변환하지 못했어요.')
  return jpeg
}

function draw(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지를 처리하지 못했어요.')
  // 축소는 부드럽게 — 기본값이면 계단이 생긴다.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return canvas
}

/**
 * 파일 → 표시본 + 썸네일.
 *
 * createImageBitmap을 먼저 쓴다: 디코딩이 워커 스레드에서 일어나 큰 사진에서도 UI가 안 멈춘다.
 * 미지원(구형 Safari)이면 <img> 디코딩으로 떨어진다.
 */
export async function resizePhoto(file: File): Promise<ResizedPhoto> {
  let source: CanvasImageSource
  let w: number
  let h: number

  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file)
    source = bmp
    w = bmp.width
    h = bmp.height
  } else {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image()
        el.onload = () => res(el)
        el.onerror = () => rej(new Error('이미지를 읽지 못했어요.'))
        el.src = url
      })
      source = img
      w = img.naturalWidth
      h = img.naturalHeight
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const d = fitWithin(w, h, DISPLAY_MAX)
  const t = fitWithin(w, h, THUMB_MAX)
  const display = await toBlob(draw(source, d.w, d.h), 0.86)
  const thumb = await toBlob(draw(source, t.w, t.h), 0.78)

  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close()

  return { display, thumb, width: d.w, height: d.h }
}
