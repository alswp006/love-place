// 반복 일정(RRULE) — 설계서 §4.2/§5.1. 순수 함수(테스트로 못박음).
// 단순화 RRULE: FREQ(DAILY/WEEKLY/MONTHLY)·INTERVAL·COUNT·UNTIL·EXDATE 지원.
// (BYDAY·RECURRENCE-ID 회차별 오버라이드는 후속 — v1은 시리즈 편집 모델.)
import { dayKey } from './eventDays'

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type ParsedRule = {
  freq: Freq
  interval: number
  count?: number
  until?: string // ISO
  exdates: string[] // 제외할 날짜키 'YYYY-MM-DD'
}

export function parseRule(text: string | null | undefined): ParsedRule | null {
  if (!text) return null
  const map: Record<string, string> = {}
  for (const part of text.split(';')) {
    const [k, v] = part.split('=')
    if (k && v) map[k.trim().toUpperCase()] = v.trim()
  }
  const freq = map.FREQ
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null
  const rule: ParsedRule = { freq, interval: Math.max(1, Number(map.INTERVAL ?? '1') || 1), exdates: [] }
  if (map.COUNT) rule.count = Math.max(1, Number(map.COUNT) || 1)
  if (map.UNTIL) rule.until = map.UNTIL
  if (map.EXDATE) rule.exdates = map.EXDATE.split(',').map((s) => s.trim()).filter(Boolean)
  return rule
}

export function buildRule(freq: Freq, interval: number, count?: number, exdates?: string[]): string {
  let s = `FREQ=${freq};INTERVAL=${Math.max(1, interval)}`
  if (count && count > 0) s += `;COUNT=${count}`
  if (exdates && exdates.length > 0) s += `;EXDATE=${exdates.join(',')}`
  return s
}

function advance(d: Date, freq: Freq, interval: number): Date {
  const n = new Date(d)
  if (freq === 'DAILY') n.setUTCDate(n.getUTCDate() + interval)
  else if (freq === 'WEEKLY') n.setUTCDate(n.getUTCDate() + 7 * interval)
  else n.setUTCMonth(n.getUTCMonth() + interval)
  return n
}

/** start(ISO)부터 규칙대로 전개해 [winStart,winEnd] 안의 occurrence 시작 ISO 배열. COUNT/UNTIL/EXDATE 적용. */
export function expandOccurrences(
  startIso: string,
  rule: ParsedRule,
  winStartIso: string,
  winEndIso: string,
): string[] {
  const out: string[] = []
  const winStart = new Date(winStartIso).getTime()
  const winEnd = new Date(winEndIso).getTime()
  const until = rule.until ? new Date(rule.until).getTime() : Infinity
  const maxCount = rule.count ?? 10000
  const exset = new Set(rule.exdates)

  let occ = new Date(startIso)
  for (let i = 0; i < maxCount && i < 3000; i++) {
    const t = occ.getTime()
    if (t > until || t > winEnd) break
    if (t >= winStart && !exset.has(dayKey(occ.toISOString()))) {
      out.push(occ.toISOString())
    }
    occ = advance(occ, rule.freq, rule.interval)
  }
  return out
}

export type Occurrence<T> = T & { _seriesStart: string; _seriesEnd: string }

/** 이벤트들을 [winStart,winEnd] 윈도우의 표시용 occurrence로 전개.
 *  반복이면 여러 개로, 아니면 윈도우 안일 때 1개. start/end는 occurrence 시각, _seriesStart/End는 시리즈 원본(편집용). */
export function expandEvents<
  T extends { id: string; start: string; end: string; recurrence_rule?: string | null },
>(events: T[], winStartIso: string, winEndIso: string): Occurrence<T>[] {
  const out: Occurrence<T>[] = []
  for (const e of events) {
    const rule = parseRule(e.recurrence_rule)
    if (!rule) {
      if (e.start >= winStartIso && e.start <= winEndIso) {
        out.push({ ...e, _seriesStart: e.start, _seriesEnd: e.end })
      }
      continue
    }
    const durMs = new Date(e.end).getTime() - new Date(e.start).getTime()
    for (const occStart of expandOccurrences(e.start, rule, winStartIso, winEndIso)) {
      const occEnd = new Date(new Date(occStart).getTime() + durMs).toISOString()
      out.push({ ...e, start: occStart, end: occEnd, _seriesStart: e.start, _seriesEnd: e.end })
    }
  }
  return out
}
