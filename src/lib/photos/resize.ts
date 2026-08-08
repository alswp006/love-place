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

/** 캔버스 → blob(webp 우선). 아바타 크롭도 같은 규칙을 써야 해서 export한다. */
export async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  // webp는 같은 화질에서 jpeg보다 훨씬 작다. Safari 14+/Chrome 전부 지원.
  //
  // 폴백 판정을 blob==null로 하면 안 된다: 명세상 toBlob은 **미지원 MIME이면 null이 아니라
  // PNG를 돌려준다**. 그래서 예전 코드의 jpeg 폴백은 절대 실행되지 않았고, 미지원 엔진에서는
  // .webp 이름표를 단 PNG가 올라갔다. 실제로 나온 타입을 보고 판정한다.
  const webp = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality))
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
  if (jpeg && jpeg.type === 'image/jpeg') return jpeg
  if (webp) return webp // PNG라도 이름표만 맞으면 된다(아래 ext가 blob.type에서 나온다)
  throw new Error('이미지를 변환하지 못했어요.')
}

/** blob MIME → 파일 확장자. 저장 경로가 실제 내용과 어긋나지 않게 한다. */
export function extOf(blob: Blob): string {
  if (blob.type === 'image/webp') return 'webp'
  if (blob.type === 'image/jpeg') return 'jpg'
  return 'png'
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
    // imageOrientation: 'from-image' — 세로로 찍은 사진이 눕지 않게 EXIF 회전을 디코딩 단계에서
    // 적용한다. 기본값은 명세 이력상 엔진마다 갈려서 명시하지 않으면 <img> 폴백과 결과가 달라진다.
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
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

  try {
    const d = fitWithin(w, h, DISPLAY_MAX)
    const t = fitWithin(w, h, THUMB_MAX)
    const display = await encodeCanvas(draw(source, d.w, d.h), 0.86)
    const thumb = await encodeCanvas(draw(source, t.w, t.h), 0.78)
    return { display, thumb, width: d.w, height: d.h }
  } finally {
    // 예외가 나도 반드시 닫는다 — 안 닫으면 원본 해상도 비트맵이 GC까지 그대로 남는다.
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close()
  }
}
