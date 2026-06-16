import { describe, it, expect } from 'vitest'
import { courseKey } from '@/lib/route/courseKey'

describe('courseKey', () => {
  it('is deterministic and order-independent over placeIds', () => {
    const a = courseKey('c1', '2026-06-20', ['p2', 'p1', 'p3'], 600)
    const b = courseKey('c1', '2026-06-20', ['p1', 'p3', 'p2'], 600)
    expect(a).toBe(b)
  })
  it('differs by date, startMin, couple, and place set', () => {
    const base = courseKey('c1', '2026-06-20', ['p1', 'p2'], 600)
    expect(courseKey('c1', '2026-06-21', ['p1', 'p2'], 600)).not.toBe(base)
    expect(courseKey('c1', '2026-06-20', ['p1', 'p2'], 660)).not.toBe(base)
    expect(courseKey('c2', '2026-06-20', ['p1', 'p2'], 600)).not.toBe(base)
    expect(courseKey('c1', '2026-06-20', ['p1', 'p2', 'p3'], 600)).not.toBe(base)
  })
})
