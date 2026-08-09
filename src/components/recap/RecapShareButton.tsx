import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { drawRecapCard, shareRecapBlob } from '@/lib/recap/shareCard'
import { shareablePath, type LatLng } from '@/lib/recap/sharePath'
import type { RecapStats } from '@/lib/recap/recapStats'
import { haptic } from '@/lib/haptics'

// 리캡 공유 — offscreen canvas로 카드 PNG를 그려 OS 공유 시트(또는 다운로드)로. 서버/공개 링크 없음.
//
// 경로는 **반드시 shareablePath를 거친다** — 실측 경로를 그대로 올리면 시작점이 곧 집이다.
// 이 컴포넌트가 그 관문이므로 여기서 우회 경로를 만들지 않는다(트림 끄는 prop 없음).
export function RecapShareButton({
  title,
  stats,
  recordedPath,
  placePath,
  daysTogether,
  totalKm,
  dateLabel,
}: {
  title: string
  stats: RecapStats
  /** 실측 GPS 경로(있으면 이게 주인공) */
  recordedPath: readonly LatLng[]
  /** 폴백 — 방문 장소를 이은 선 */
  placePath: readonly LatLng[]
  daysTogether?: number | null
  totalKm?: number | null
  dateLabel?: string | null
}) {
  const [busy, setBusy] = useState(false)

  const onShare = async () => {
    setBusy(true)
    try {
      const { path, source } = shareablePath(recordedPath, placePath)
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1920
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawRecapCard(ctx, {
        title,
        stats,
        path,
        recorded: source === 'recorded',
        daysTogether,
        totalKm,
        dateLabel,
      })
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      )
      if (!blob) return
      await shareRecapBlob(blob, `${title || 'recap'}.png`)
      haptic()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="primary"
      onClick={() => void onShare()}
      disabled={busy}
      aria-label="리캡 카드 공유"
    >
      {busy ? '준비 중…' : '공유'}
    </Button>
  )
}
