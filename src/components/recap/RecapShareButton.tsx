import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { drawRecapCard, shareRecapBlob } from '@/lib/recap/shareCard'
import type { RecapStats, RecapVertex } from '@/lib/recap/recapStats'
import { haptic } from '@/lib/haptics'

// 리캡 공유 — offscreen canvas로 카드 PNG를 그려 OS 공유 시트(또는 다운로드)로. 서버/공개 링크 없음.
export function RecapShareButton({
  title,
  stats,
  vertices,
}: {
  title: string
  stats: RecapStats
  vertices: RecapVertex[]
}) {
  const [busy, setBusy] = useState(false)

  const onShare = async () => {
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1920
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawRecapCard(ctx, { title, stats, vertices })
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
