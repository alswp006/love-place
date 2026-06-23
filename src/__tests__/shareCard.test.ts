import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawRecapCard, shareRecapBlob } from '@/lib/recap/shareCard'
import type { RecapVertex } from '@/lib/recap/recapStats'

const vtx: RecapVertex[] = [
  { visitId: 'v1', placeId: 'p1', name: 'a', lat: 37, lng: 127, visitDate: null, regionLabel: null },
  { visitId: 'v2', placeId: 'p2', name: 'b', lat: 38, lng: 127, visitDate: null, regionLabel: null },
]

function mockCtx() {
  return {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set font(_v: string) {},
    set lineWidth(_v: number) {},
    set lineCap(_v: string) {},
    set lineJoin(_v: string) {},
    set textAlign(_v: string) {},
  } as unknown as CanvasRenderingContext2D
}

describe('drawRecapCard', () => {
  it('배경·제목·동선·스탯을 ctx에 그린다', () => {
    const ctx = mockCtx()
    drawRecapCard(ctx, { title: '속초', stats: { stopCount: 2, distanceKm: 111, days: 3 }, vertices: vtx })
    expect(ctx.fillRect).toHaveBeenCalled() // 배경
    expect(ctx.fillText).toHaveBeenCalled() // 제목/스탯
    expect(ctx.stroke).toHaveBeenCalled() // 동선
    expect(ctx.arc).toHaveBeenCalled() // 정점 점
  })
  it('정점 1개면 동선(stroke)은 안 그린다', () => {
    const ctx = mockCtx()
    drawRecapCard(ctx, { title: 'x', stats: { stopCount: 1, distanceKm: 0, days: 1 }, vertices: [vtx[0]!] })
    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})

describe('shareRecapBlob', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('Web Share(files) 지원 시 share 호출 → shared', async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const r = await shareRecapBlob(new Blob(['x']), 'a.png')
    expect(share).toHaveBeenCalledTimes(1)
    expect(r).toBe('shared')
  })

  it('미지원 시 다운로드 폴백 → downloaded(공개 링크/서버 없음)', async () => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const r = await shareRecapBlob(new Blob(['x']), 'a.png')
    expect(r).toBe('downloaded')
    expect(click).toHaveBeenCalledTimes(1)
  })
})
