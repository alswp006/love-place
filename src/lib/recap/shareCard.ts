import type { RecapStats } from '@/lib/recap/recapStats'
import { formatTotalKm, type LatLng } from './sharePath'

// 리캡 공유 카드 — 기기 내 canvas로 그려 PNG로 공유(서버/공개 링크 없음, spec §share).
//
// 이 카드는 장식이 아니라 **획득 채널**이다(나이키 런 클럽의 공유 카드와 같은 자리).
// 그래서 세 가지를 지킨다:
//   ① 주인공은 경로다. 삐뚤빼뚤한 실측 선이 "우리가 진짜 걸었다"의 증거고, 그게 자랑거리다.
//   ② 못 꾸며내는 숫자를 크게 둔다. 오늘 거리보다 **함께 걸은 누적**이 관계의 깊이를 말한다.
//   ③ 좌표·축척·지명을 일절 넣지 않는다. 경로는 sharePath.trimEnds로 양 끝을 잘라 받는다.
//
// 브랜딩은 뗄 수 없다 — 이게 유입 경로다. 워터마크 제거를 유료 기능으로 팔면 성장을 팔아먹는 것이다.

const W = 1080
const H = 1920

// 마시멜로 톤(앱 토큰과 같은 계열이되 캔버스라 리터럴).
const BG = '#fff1f4'
const INK = '#4a3038'
const INK_SOFT = '#8d6b76'
const LINE = '#e2638a'
const LINE_GLOW = '#ffd3df'
const ACCENT = '#b23a60'

export type ShareCardData = {
  title: string
  stats: RecapStats
  /** 이미 트림된 경로(sharePath.shareablePath). 빈 배열이면 숫자만 있는 카드가 된다. */
  path: LatLng[]
  /** 실측 GPS 경로인지 — 카드에 '실제로 걸은 길'이라고 말할 수 있는지 가른다. */
  recorded: boolean
  /** 함께한 지 며칠(연결일 기준). 없으면 줄을 그리지 않는다. */
  daysTogether?: number | null
  /** 함께 걸은 누적 거리(km). 없으면 줄을 그리지 않는다. */
  totalKm?: number | null
  /** 언제였는지. 공유 카드는 기록물이라 날짜가 없으면 나중에 아무 의미가 없다. */
  dateLabel?: string | null
}

/** 경로를 카드 영역에 비율 유지로 맞춘다 — 늘리면 실제 걸은 모양이 아니게 된다. */
function fitPath(
  path: readonly LatLng[],
  box: { x: number; y: number; w: number; h: number },
): { x: number; y: number }[] {
  const lats = path.map((p) => p.lat)
  const lngs = path.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  // 위도 1도와 경도 1도의 실제 거리가 다르다(위도 37도에서 경도는 약 0.8배).
  // 보정하지 않으면 남북으로 길쭉한 경로가 옆으로 퍼져 '우리가 걸은 모양'이 아니게 된다.
  const latSpan = Math.max(maxLat - minLat, 1e-9)
  const lngSpan = Math.max((maxLng - minLng) * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180), 1e-9)
  const k = Math.min(box.w / lngSpan, box.h / latSpan)
  const drawW = lngSpan * k
  const drawH = latSpan * k
  const ox = box.x + (box.w - drawW) / 2
  const oy = box.y + (box.h - drawH) / 2
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  return path.map((p) => ({
    x: ox + (p.lng - minLng) * cos * k,
    y: oy + drawH - (p.lat - minLat) * k,
  }))
}

export function drawRecapCard(ctx: CanvasRenderingContext2D, data: ShareCardData, w = W, h = H): void {
  const { title, stats, path, recorded, daysTogether, totalKm, dateLabel } = data

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, w, h)

  ctx.textAlign = 'center'
  ctx.fillStyle = INK
  ctx.font = '700 88px sans-serif'
  ctx.fillText(title || '우리가 걸은 길', w / 2, 200)

  ctx.fillStyle = INK_SOFT
  ctx.font = '500 44px sans-serif'
  // 날짜가 있으면 날짜를 쓴다 — '실제로 걸은 길'보다 '언제'가 기록물로서 값어치가 크다.
  ctx.fillText(dateLabel || (recorded ? '실제로 걸은 길' : '우리가 다녀온 곳'), w / 2, 268)

  // ── 경로: 카드의 주인공 — 남는 세로를 최대한 준다 ──
  const box = { x: 110, y: 340, w: w - 220, h: 900 }
  if (path.length >= 2) {
    const pts = fitPath(path, box)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const stroke = (width: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
    }
    stroke(34, LINE_GLOW) // 뒤에 두꺼운 연한 선 — 얇은 선 하나면 인스타 축소본에서 사라진다
    stroke(14, LINE)

    // 시작·끝 점. 좌표는 이미 트림돼 실제 출발지가 아니다(sharePath 참조).
    const first = pts[0]!
    const last = pts[pts.length - 1]!
    for (const [p, fill] of [
      [first, '#ffffff'],
      [last, LINE],
    ] as const) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 20, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.lineWidth = 8
      ctx.strokeStyle = LINE
      ctx.stroke()
    }
  } else {
    // 경로가 없거나 너무 짧아 트림에서 다 날아간 경우 — 빈 상자를 그리지 않고 조용히 비운다.
    ctx.fillStyle = INK_SOFT
    ctx.font = '500 40px sans-serif'
    ctx.fillText('동선을 기록하면 걸은 길이 여기 그려져요', w / 2, box.y + box.h / 2)
  }

  // ── 이번 기록의 숫자 ──
  // 'N일'은 하루짜리 데이트에선 노이즈다. 그리고 아래 누적과 거리 단위가 겹치므로
  // '오늘/이번'을 붙여 무엇의 거리인지 분명히 한다(3.4km와 312km가 나란히 있으면 헷갈린다).
  const statY = box.y + box.h + 140
  const parts = [`${stats.distanceKm}km`, `${stats.stopCount}곳`]
  if (stats.days > 1) parts.push(`${stats.days}일`)
  ctx.fillStyle = INK
  ctx.font = '600 60px sans-serif'
  ctx.fillText(`${stats.days > 1 ? '이번 여행' : '오늘'}  ${parts.join(' · ')}`, w / 2, statY)

  // ── 못 꾸며내는 숫자: 함께한 시간과 누적 거리 ──
  // 오늘 3km는 약하다. "428일 · 312km"는 하루아침에 못 만든다 — 그게 커플판 '총 러닝 거리'다.
  if (daysTogether != null && daysTogether > 0 && totalKm != null && totalKm > 0) {
    const y = statY + 170
    ctx.fillStyle = ACCENT
    ctx.font = '700 76px sans-serif'
    ctx.fillText(`함께 ${daysTogether}일 · ${formatTotalKm(totalKm)}`, w / 2, y)
    ctx.fillStyle = INK_SOFT
    ctx.font = '500 40px sans-serif'
    ctx.fillText('우리가 함께 걸어온 거리', w / 2, y + 66)
  }

  ctx.fillStyle = ACCENT
  ctx.font = '600 48px sans-serif'
  ctx.fillText('love place', w / 2, h - 140)
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
    await nav.share({ files: [file], title: '우리가 걸은 길' })
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
