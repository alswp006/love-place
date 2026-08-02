import { describe, it, expect } from 'vitest'
import { buildActivityFeed, relativeLabel, truncate, type ActivitySource } from '@/lib/feed/activityFeed'

const src = (over: Partial<ActivitySource> = {}): ActivitySource => ({
  id: 'x1',
  kind: 'place',
  name: '칠성조선소',
  createdAt: '2026-07-25T10:00:00.000Z',
  createdBy: 'you',
  ...over,
})

describe('buildActivityFeed', () => {
  it('내가 한 일은 빼고 상대 것만 남긴다(피드의 목적)', () => {
    const items = buildActivityFeed(
      [src({ id: 'a', createdBy: 'me' }), src({ id: 'b', createdBy: 'you' })],
      'me',
    )
    expect(items).toHaveLength(1)
    expect(items[0]!.actorId).toBe('you')
  })

  it('최신순으로 정렬한다', () => {
    const items = buildActivityFeed(
      [
        src({ id: 'old', createdAt: '2026-07-24T10:00:00.000Z' }),
        src({ id: 'new', createdAt: '2026-07-25T10:00:00.000Z' }),
      ],
      'me',
    )
    expect(items.map((i) => i.id)).toEqual(['place:new', 'place:old'])
  })

  it('종류별로 다른 문장을 만든다', () => {
    const one = (kind: ActivitySource['kind'], name: string) =>
      buildActivityFeed([src({ kind, name })], 'me')[0]!.text
    expect(one('place', '칠성조선소')).toContain('가고싶은 곳에 담았어요')
    expect(one('visit', '영금정')).toContain('다녀왔어요')
    expect(one('trip', '속초 여행')).toContain('여행을 만들었어요')
    expect(one('event', '저녁 약속')).toContain('일정을 만들었어요')
    expect(one('comment', '주차 어려울 듯')).toContain('라고 남겼어요')
  })

  it('이름이 없거나 공백뿐이면 기본 문구로 대체한다(빈 따옴표 방지)', () => {
    expect(buildActivityFeed([src({ name: null })], 'me')[0]!.text).toContain('새 장소')
    expect(buildActivityFeed([src({ name: '   ' })], 'me')[0]!.text).toContain('새 장소')
  })

  it('id는 종류를 포함해 테이블 간 충돌을 피한다', () => {
    const items = buildActivityFeed([src({ id: 'same', kind: 'place' }), src({ id: 'same', kind: 'trip' })], 'me')
    expect(new Set(items.map((i) => i.id)).size).toBe(2)
  })

  it('최대 개수로 자른다', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      src({ id: `n${i}`, createdAt: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    )
    expect(buildActivityFeed(many, 'me', 5)).toHaveLength(5)
  })

  it('myId가 없으면(미로그인) 아무것도 빼지 않는다', () => {
    expect(buildActivityFeed([src({ createdBy: 'you' })], null)).toHaveLength(1)
  })
})

describe('truncate', () => {
  it('긴 댓글 본문은 줄인다(전문은 그 일정에서 본다)', () => {
    expect(truncate('가'.repeat(50), 40)).toBe(`${'가'.repeat(40)}…`)
    expect(truncate('짧은 글', 40)).toBe('짧은 글')
  })
})

describe('relativeLabel', () => {
  const now = '2026-07-25T12:00:00.000Z'
  it('방금 / 분 / 시간 / 일', () => {
    expect(relativeLabel('2026-07-25T11:59:30.000Z', now)).toBe('방금')
    expect(relativeLabel('2026-07-25T11:30:00.000Z', now)).toBe('30분 전')
    expect(relativeLabel('2026-07-25T09:00:00.000Z', now)).toBe('3시간 전')
    expect(relativeLabel('2026-07-22T12:00:00.000Z', now)).toBe('3일 전')
  })
})
