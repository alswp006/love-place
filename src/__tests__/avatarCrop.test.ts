import { describe, it, expect } from 'vitest'
import {
  IDENTITY_CROP,
  MAX_ZOOM,
  panBy,
  previewLayout,
  sourceSquare,
} from '@/lib/photos/avatar'
import { avatarPath } from '@/hooks/useAvatarUpload'

// 크롭은 "보이는 것과 저장되는 것이 같아야 한다"가 전부다.
// 미리보기(previewLayout)와 결과물(sourceSquare→drawImage)이 어긋나면 사용자는 조작할 방법이 없다.
// 그래서 둘이 같은 값에서 나오는지, 그리고 프레임 밖으로 새지 않는지를 못박는다.

const FRAME = 260

describe('sourceSquare — 원본에서 잘라낼 정사각 영역', () => {
  it('zoom=1이면 짧은 변 전체를 중앙에서 — 가로 사진', () => {
    // 4000×3000 → 3000짜리 정사각을 가로 중앙(500)에서
    expect(sourceSquare(4000, 3000, IDENTITY_CROP)).toEqual({ sx: 500, sy: 0, size: 3000 })
  })

  it('zoom=1이면 짧은 변 전체를 중앙에서 — 세로 사진', () => {
    expect(sourceSquare(3000, 4000, IDENTITY_CROP)).toEqual({ sx: 0, sy: 500, size: 3000 })
  })

  it('정사각 원본은 통째로 — 잘릴 것이 없다', () => {
    expect(sourceSquare(1000, 1000, IDENTITY_CROP)).toEqual({ sx: 0, sy: 0, size: 1000 })
  })

  it('zoom이 커지면 좁게 잘린다(=확대)', () => {
    const { size } = sourceSquare(4000, 3000, { ...IDENTITY_CROP, zoom: 2 })
    expect(size).toBe(1500)
  })

  it('pan ±1이 원본 가장자리 — 그 밖으로는 못 간다', () => {
    const left = sourceSquare(4000, 3000, { zoom: 1, panX: -1, panY: 0 })
    const right = sourceSquare(4000, 3000, { zoom: 1, panX: 1, panY: 0 })
    expect(left.sx).toBe(0)
    expect(right.sx).toBe(1000) // w - size
  })

  it('pan을 범위 밖으로 줘도 잘라낸 영역이 원본을 벗어나지 않는다(투명 구멍 방지)', () => {
    for (const pan of [-99, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = sourceSquare(4000, 3000, { zoom: 1, panX: pan, panY: pan })
      expect(r.sx).toBeGreaterThanOrEqual(0)
      expect(r.sy).toBeGreaterThanOrEqual(0)
      expect(r.sx + r.size).toBeLessThanOrEqual(4000)
      expect(r.sy + r.size).toBeLessThanOrEqual(3000)
    }
  })

  it('zoom을 범위 밖으로 줘도 [1,3]으로 조인다', () => {
    expect(sourceSquare(3000, 3000, { ...IDENTITY_CROP, zoom: 100 }).size).toBe(3000 / MAX_ZOOM)
    expect(sourceSquare(3000, 3000, { ...IDENTITY_CROP, zoom: 0.1 }).size).toBe(3000)
    expect(sourceSquare(3000, 3000, { ...IDENTITY_CROP, zoom: Number.NaN }).size).toBe(3000)
  })

  it('크기 0 이미지에도 안 터진다', () => {
    expect(sourceSquare(0, 0, IDENTITY_CROP)).toEqual({ sx: 0, sy: 0, size: 0 })
  })
})

describe('previewLayout — 미리보기가 결과물과 같은 곳을 가리킨다', () => {
  it('잘라낼 영역의 좌상단이 프레임 좌상단(0,0)에 온다', () => {
    const t = { zoom: 1.7, panX: -0.3, panY: 0.6 }
    const { sx, sy, size } = sourceSquare(4000, 3000, t)
    const l = previewLayout(4000, 3000, t, FRAME)
    const k = FRAME / size
    expect(l.left).toBeCloseTo(-sx * k, 6)
    expect(l.top).toBeCloseTo(-sy * k, 6)
  })

  it('잘라낸 영역이 프레임을 정확히 채운다 — 빈 여백이 생기지 않는다', () => {
    for (const t of [
      IDENTITY_CROP,
      { zoom: 2.4, panX: 1, panY: -1 },
      { zoom: 1, panX: -1, panY: 1 },
    ]) {
      const l = previewLayout(4000, 3000, t, FRAME)
      // 이미지가 프레임을 완전히 덮는지: 좌상단은 0 이하, 우하단은 FRAME 이상.
      expect(l.left).toBeLessThanOrEqual(0.001)
      expect(l.top).toBeLessThanOrEqual(0.001)
      expect(l.left + l.width).toBeGreaterThanOrEqual(FRAME - 0.001)
      expect(l.top + l.height).toBeGreaterThanOrEqual(FRAME - 0.001)
    }
  })

  it('원본 비율이 유지된다 — 얼굴이 늘어나지 않는다', () => {
    const l = previewLayout(4000, 3000, { zoom: 1.3, panX: 0.2, panY: 0 }, FRAME)
    expect(l.width / l.height).toBeCloseTo(4000 / 3000, 6)
  })
})

describe('panBy — 끌기/방향키가 손가락을 따라간다', () => {
  it('오른쪽으로 끌면 이미지가 오른쪽으로 = 잘라내는 창은 왼쪽으로', () => {
    const before = sourceSquare(4000, 3000, IDENTITY_CROP).sx
    const after = sourceSquare(4000, 3000, panBy(4000, 3000, IDENTITY_CROP, 40, 0, FRAME)).sx
    expect(after).toBeLessThan(before)
  })

  it('끌어도 범위를 넘지 않는다 — 아무리 밀어도 가장자리에서 멈춘다', () => {
    let t = IDENTITY_CROP
    for (let i = 0; i < 200; i++) t = panBy(4000, 3000, t, 50, 50, FRAME)
    const r = sourceSquare(4000, 3000, t)
    expect(r.sx).toBe(0)
    expect(r.sy).toBeGreaterThanOrEqual(0)
    expect(r.sx + r.size).toBeLessThanOrEqual(4000)
  })

  it('움직일 여지가 없는 축은 그대로 — 0으로 나누지 않는다', () => {
    // 정사각 원본 + zoom 1이면 두 축 다 여지 없음
    const t = panBy(1000, 1000, IDENTITY_CROP, 80, 80, FRAME)
    expect(t.panX).toBe(0)
    expect(t.panY).toBe(0)
    expect(Number.isFinite(t.panX)).toBe(true)
  })

  it('가로 사진의 세로축은 안 움직인다(짧은 변이 이미 꽉 참)', () => {
    const t = panBy(4000, 3000, IDENTITY_CROP, 0, 80, FRAME)
    expect(t.panY).toBe(0)
  })
})

describe('avatarPath — Storage 격리 규약', () => {
  it('첫 폴더가 couple_id다 — 0022 정책이 이걸로 타 커플을 막는다', () => {
    const p = avatarPath('cpl-1', 'usr-9', 1754000000000, 'webp')
    expect(p.split('/')[0]).toBe('cpl-1')
    expect(p).toBe('cpl-1/avatars/usr-9-1754000000000.webp')
  })

  it('올릴 때마다 경로가 달라진다 — 같은 경로면 서명 URL 캐시 때문에 옛 사진이 계속 보인다', () => {
    const a = avatarPath('c', 'u', 1, 'webp')
    const b = avatarPath('c', 'u', 2, 'webp')
    expect(a).not.toBe(b)
  })
})
