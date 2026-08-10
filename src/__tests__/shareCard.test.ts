import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawRecapCard, shareRecapBlob } from '@/lib/recap/shareCard'

// 카드는 이제 **이미 트림된 경로**를 받는다(집 노출 방지는 sharePath가 담당 — sharePath.test.ts).
const path = [
  { lat: 37.0, lng: 127.0 },
  { lat: 37.01, lng: 127.01 },
  { lat: 37.02, lng: 127.005 },
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
  const stats = { stopCount: 2, distanceKm: 3.4, days: 1 }

  it('배경·제목·동선·스탯을 ctx에 그린다', () => {
    const ctx = mockCtx()
    drawRecapCard(ctx, { title: '속초', stats, path, recorded: true })
    expect(ctx.fillRect).toHaveBeenCalled() // 배경
    expect(ctx.fillText).toHaveBeenCalled() // 제목/스탯
    expect(ctx.stroke).toHaveBeenCalled() // 동선
    expect(ctx.arc).toHaveBeenCalled() // 시작·끝 점
  })

  it('경로가 없으면 선을 그리지 않고 안내 문구로 대체한다(빈 상자 금지)', () => {
    const ctx = mockCtx()
    drawRecapCard(ctx, { title: 'x', stats, path: [], recorded: false })
    expect(ctx.stroke).not.toHaveBeenCalled()
    const said = (ctx.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0])
    expect(said.some((t) => String(t).includes('동선을 기록하면'))).toBe(true)
  })

  it('실측이면 "실제로 걸은 길", 아니면 다른 문구 — 없는 것을 있다고 하지 않는다', () => {
    const a = mockCtx()
    drawRecapCard(a, { title: 'x', stats, path, recorded: true })
    const saidA = (a.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))
    expect(saidA).toContain('실제로 걸은 길')

    const b = mockCtx()
    drawRecapCard(b, { title: 'x', stats, path, recorded: false })
    const saidB = (b.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))
    expect(saidB).not.toContain('실제로 걸은 길')
  })

  it('누적(함께 N일 · Nkm)은 값이 있을 때만 — 0km짜리 자랑을 만들지 않는다', () => {
    const withTotals = mockCtx()
    drawRecapCard(withTotals, { title: 'x', stats, path, recorded: true, daysTogether: 428, totalKm: 312.4 })
    const said = (withTotals.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))
    expect(said).toContain('함께 428일 · 312km')

    const without = mockCtx()
    drawRecapCard(without, { title: 'x', stats, path, recorded: true, daysTogether: 10, totalKm: 0 })
    const said2 = (without.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))
    expect(said2.some((t) => t.includes('함께 10일'))).toBe(false)
  })

  it('브랜딩은 항상 들어간다 — 이게 유입 경로다', () => {
    const ctx = mockCtx()
    drawRecapCard(ctx, { title: 'x', stats, path: [], recorded: false })
    const said = (ctx.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))
    expect(said).toContain('Weave')
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
