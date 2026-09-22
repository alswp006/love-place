import { describe, it, expect } from 'vitest'
import { parseRule, buildRule, expandOccurrences } from '@/lib/calendar/rrule'
import { dayKey } from '@/lib/calendar/eventDays'

// BYDAY·BYMONTHDAY — '매주'가 "7일마다"가 아니라 **"무슨 요일마다"**가 된다.
//
// ⚠️ 이 테스트의 기대값은 Flutter판 `app/test/calendar/rrule_byday_test.dart`와 **같다**.
//    같은 행을 두 앱이 읽으므로, 한쪽만 통과하는 값이 있으면 그게 곧 버그다.
//    여기 숫자를 고칠 일이 생기면 저쪽도 같이 고쳐야 한다.

/** 표시 타임존(KST) 기준 그 날 09:00의 ISO. */
const at = (day: string) => `${day}T00:00:00.000Z`

/** 윈도는 **표시 타임존(KST) 하루 경계**로 잡는다.
 *  UTC 자정으로 잡으면 KST 새벽(=UTC 전날 오후) 회차가 창 밖으로 밀려, 구현이 멀쩡한데
 *  테스트만 빨개진다. Flutter판 `_keys`가 `startOfDay()`를 쓰는 것과 같은 경계다. */
const keys = (startIso: string, rule: string, from: string, to: string) =>
  expandOccurrences(
    startIso,
    parseRule(rule)!,
    `${from}T00:00:00+09:00`,
    `${to}T23:59:59.999+09:00`,
  ).map((o) => dayKey(o))

describe('파싱', () => {
  it('BYDAY를 달력 순서(일=0 … 토=6)로 읽는다', () => {
    expect(parseRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=FR,MO,SU')?.byDay).toEqual([0, 1, 5])
  })
  it('모르는 토큰은 버린다 — 깨진 규칙이 캘린더를 멈추지 않는다', () => {
    expect(parseRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,XX,2TU')?.byDay).toEqual([1])
  })
  it('BYMONTHDAY는 1~31만', () => {
    expect(parseRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15')?.byMonthDay).toBe(15)
    expect(parseRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=0')?.byMonthDay).toBeUndefined()
    expect(parseRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=32')?.byMonthDay).toBeUndefined()
    expect(parseRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1')?.byMonthDay).toBeUndefined()
  })
  it('BY*가 없는 예전 규칙은 그대로 읽힌다', () => {
    const r = parseRule('FREQ=WEEKLY;INTERVAL=2;COUNT=5')!
    expect(r.byDay).toEqual([])
    expect(r.byMonthDay).toBeUndefined()
  })
})

describe('문자열 생성 — Flutter판과 바이트가 같아야 한다', () => {
  it('BY*가 없으면 예전과 한 글자도 다르지 않다', () => {
    expect(buildRule('WEEKLY', 2, 5)).toBe('FREQ=WEEKLY;INTERVAL=2;COUNT=5')
  })
  it('필드 순서 고정 — FREQ;INTERVAL;BYDAY;COUNT;UNTIL;EXDATE', () => {
    expect(buildRule('WEEKLY', 1, 3, ['2026-10-05'], '2026-12-31T14:59:59.999Z', [5, 1])).toBe(
      'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR;COUNT=3;UNTIL=2026-12-31T14:59:59.999Z;EXDATE=2026-10-05',
    )
  })
  it('왕복해도 같은 문자열 — 헛 충돌이 안 난다', () => {
    for (const r of [
      'FREQ=WEEKLY;INTERVAL=1;BYDAY=SU,WE,SA',
      'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15;COUNT=6',
      'FREQ=DAILY;INTERVAL=1;UNTIL=2026-12-31T14:59:59.999Z',
    ]) {
      const p = parseRule(r)!
      expect(buildRule(p.freq, p.interval, p.count, p.exdates, p.until, p.byDay, p.byMonthDay)).toBe(r)
    }
  })
  it('안 맞는 조합은 떨군다 — FREQ를 바꿨을 때 죽은 필드가 되살아나지 않게', () => {
    expect(buildRule('DAILY', 1, undefined, undefined, undefined, [1])).toBe('FREQ=DAILY;INTERVAL=1')
    expect(buildRule('WEEKLY', 1, undefined, undefined, undefined, undefined, 15)).toBe(
      'FREQ=WEEKLY;INTERVAL=1',
    )
    expect(buildRule('MONTHLY', 1, undefined, undefined, undefined, [1])).toBe('FREQ=MONTHLY;INTERVAL=1')
  })
})

describe('매주 — 무슨 요일마다', () => {
  const wed = at('2026-09-23') // 수요일

  it('고른 요일에만 뜬다', () => {
    expect(keys(wed, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR', '2026-09-21', '2026-10-04')).toEqual([
      '2026-09-23',
      '2026-09-25',
      '2026-09-28',
      '2026-09-30',
      '2026-10-02',
    ])
  })
  it('시작일 요일이 목록에 없으면 시작일엔 안 뜬다', () => {
    expect(keys(wed, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH', '2026-09-21', '2026-10-02')).toEqual([
      '2026-09-24',
      '2026-09-29',
      '2026-10-01',
    ])
  })
  it('시작일보다 앞선 요일은 그 주에서 건너뛴다', () => {
    expect(keys(wed, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', '2026-09-01', '2026-10-05')).toEqual([
      '2026-09-28',
      '2026-10-05',
    ])
  })
  it('INTERVAL=2면 격주', () => {
    expect(keys(wed, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE', '2026-09-21', '2026-10-25')).toEqual([
      '2026-09-23',
      '2026-10-07',
      '2026-10-21',
    ])
  })
  it('COUNT는 회차 수다', () => {
    expect(
      keys(wed, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=4', '2026-09-01', '2026-12-31'),
    ).toEqual(['2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30'])
  })
  it('EXDATE는 그대로 먹는다', () => {
    expect(
      keys(wed, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;EXDATE=2026-09-28', '2026-09-21', '2026-10-01'),
    ).toEqual(['2026-09-23', '2026-09-30'])
  })
  it('BYDAY가 없으면 예전 그대로 7일마다', () => {
    expect(keys(wed, 'FREQ=WEEKLY;INTERVAL=1', '2026-09-21', '2026-10-08')).toEqual([
      '2026-09-23',
      '2026-09-30',
      '2026-10-07',
    ])
  })
})

describe('매월 — 며칠마다', () => {
  const sep23 = at('2026-09-23')

  it('고른 날짜에 뜬다', () => {
    expect(keys(sep23, 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=25', '2026-09-01', '2026-12-31')).toEqual(
      ['2026-09-25', '2026-10-25', '2026-11-25', '2026-12-25'],
    )
  })
  it('시작일보다 이른 날짜는 그 달을 건너뛴다', () => {
    expect(keys(sep23, 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=5', '2026-09-01', '2026-11-30')).toEqual([
      '2026-10-05',
      '2026-11-05',
    ])
  })
  it('그 달에 없는 날짜는 건너뛴다 — 2월 31일이 3월 3일이 되지 않는다', () => {
    expect(
      keys(at('2027-01-31'), 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=31', '2027-01-01', '2027-05-31'),
    ).toEqual(['2027-01-31', '2027-03-31', '2027-05-31'])
  })
  it('BYMONTHDAY가 없으면 예전 오버플로 그대로 — 기존 행이 안 움직인다', () => {
    // 오버플로는 한 번으로 안 끝난다: 2/31 → 3/03 뒤로는 3일이 기준이 된다.
    expect(keys(at('2027-01-31'), 'FREQ=MONTHLY;INTERVAL=1', '2027-01-01', '2027-05-31')).toEqual([
      '2027-01-31',
      '2027-03-03',
      '2027-04-03',
      '2027-05-03',
    ])
  })
  it('INTERVAL=2면 두 달마다', () => {
    expect(keys(sep23, 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=25', '2026-09-01', '2027-02-28')).toEqual([
      '2026-09-25',
      '2026-11-25',
      '2027-01-25',
    ])
  })
})

describe('요일 판정은 표시 타임존 기준', () => {
  it('KST 새벽 일정도 그 날 요일로 센다 — UTC로 세면 하루 밀린다', () => {
    // KST 2026-09-21(월) 01:00 = UTC 2026-09-20(일) 16:00.
    const kstMon = '2026-09-20T16:00:00.000Z'
    expect(new Date(kstMon).getUTCDay()).toBe(0) // UTC로는 일요일
    expect(keys(kstMon, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', '2026-09-21', '2026-10-05')).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ])
  })
})
