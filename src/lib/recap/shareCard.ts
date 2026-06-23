import type { RecapStats, RecapVertex } from '@/lib/recap/recapStats'

// 리캡 공유 카드 — 기기 내 canvas로 그려 PNG로 공유(서버/공개 링크 없음, spec §share). 마시멜로 톤.
// 동선은 정점 좌표를 카드 영역에 정규화한 단순화 스케치(측지선 — 실제 경로 미기록).
export function drawRecapCard(
  ctx: CanvasRenderingContext2D,
  data: { title: string; stats: RecapStats; vertices: RecapVertex[] },
  w = 1080,
  h = 1920,
): void {
  const { title, stats, vertices } = data
  ctx.fillStyle = '#fff1f4' // 핑크크림 배경
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#6b4a52' // 자두 잉크
  ctx.textAlign = 'center'
  ctx.font = '700 84px sans-serif'
  ctx.fillText(title || '우리 여행', w / 2, 220)

  const pad = 140
  const top = 360
  const boxH = 900
  if (vertices.length >= 2) {
    const lats = vertices.map((v) => v.lat)
    const lngs = vertices.map((v) => v.lng)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const sx = (lng: number) => pad + ((lng - minLng) / (maxLng - minLng || 1)) * (w - 2 * pad)
    const sy = (lat: number) => top + boxH - ((lat - minLat) / (maxLat - minLat || 1)) * boxH
    ctx.strokeStyle = '#e2638a' // 핑크 동선
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    vertices.forEach((v, i) => {
      const x = sx(v.lng)
      const y = sy(v.lat)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.fillStyle = '#ff93ac'
    vertices.forEach((v) => {
      ctx.beginPath()
      ctx.arc(sx(v.lng), sy(v.lat), 18, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  ctx.fillStyle = '#6b4a52'
  ctx.font = '500 64px sans-serif'
  ctx.fillText(
    `📍 ${stats.stopCount}곳   📏 ${stats.distanceKm}km   🗓️ ${stats.days}일`,
    w / 2,
    top + boxH + 170,
  )
  ctx.fillStyle = '#b23a60'
  ctx.font = '600 48px sans-serif'
  ctx.fillText('둘이 함께한 추억 · love place', w / 2, h - 160)
}

type ShareNavigator = Navigator & {
  canShare?: (data: { files: File[] }) => boolean
  share?: (data: { files?: File[]; title?: string }) => Promise<void>
}

// 공유: Web Share(files) 지원 시 OS 공유 시트, 아니면 다운로드 폴백. 공개 링크/서버 업로드 없음.
export async function shareRecapBlob(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const nav = navigator as ShareNavigator
  const file = new File([blob], filename, { type: 'image/png' })
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({ files: [file], title: '여행 리캡' })
    return 'shared'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return 'downloaded'
}
