import { zipSync, unzipSync } from 'fflate'
import type { CoupleExport } from './dumpSchema'

export type ZipPhoto = { name: string; bytes: Uint8Array }

// 관계종료 회수용 ZIP(§10.4) — JSON 봉투 + 사진 표시본 blob(1600px 리사이즈본 — 원본은 보관하지 않는다. §5.2 '사본' 해석). 양측 동등(RLS 대칭).
export function buildExportZip(data: CoupleExport, photos: ZipPhoto[]): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  files['data.json'] = new TextEncoder().encode(JSON.stringify(data, null, 2))
  for (const p of photos) files[p.name] = p.bytes
  return zipSync(files, { level: 6 })
}

// 테스트 헬퍼 재노출(검증 전용).
export { unzipSync }
