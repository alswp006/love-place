// 여러 날에 걸친 것들을 **주 단위 막대**로 배치한다. 순수 함수.
//
// ⚠️ Flutter판 `app/lib/calendar/week_spans.dart`의 이식. 같은 달력을 두 앱이 보여주므로
//    한쪽만 고치지 말 것 — 테스트 기대값도 양쪽이 같은 숫자를 본다.
//
// ## 왜 칸이 아니라 주인가
//
// 칸마다 조각을 그리면 제목이 칸 너비(≈50px)에서 잘린다. '부산여행'이 '부산여'가 되고,
// 이어진 칸들은 이름 없는 막대로 남는다 — 한 줄처럼 보이지만 읽을 수가 없다.
// 주 한 줄을 **가로질러** 하나의 막대를 그리면 제목이 그 길이만큼 자리를 갖는다.
//
// ## 반복 일정은 이어지지 않는다
//
// 매일 반복은 **하루짜리가 여러 번**이지 여러 날에 걸친 하나가 아니다. 전개된 회차마다
// 시작과 끝이 같은 날이므로 여기 오지 않는다 — 판정 기준이 id가 아니라 **그 회차의
// 날짜 범위**인 이유다. id로 판정하면 반복이 통째로 이어진 막대가 된다(실제로 그랬다).
//
// ## 여행도 같은 막대로 — 이벤트를 만들지 않고
//
// "부산여행 10/4~10/6"은 그 사흘을 가로지르는 막대 하나다. 여행 행에서 그때그때 뽑아
// 그리므로(§7 상태는 도출, 저장 아님) 날짜를 고치면 달력이 저절로 따라온다.
// 일정과 여행이 같은 배치 규칙을 쓰도록 SpanItem으로 한 번 감싼다 — 줄 배정 코드가
// 둘로 갈리면 "여행만 겹침 처리가 다르다"가 한쪽에서만 난다.
import { dayKey } from './eventDays'

export type SpanItem = {
  /** 중복 제거용 키. 여행은 'trip:' 접두가 붙어 일정 id와 섞이지 않는다. */
  id: string
  title: string
  /** 날짜 키('YYYY-MM-DD'), 양끝 포함. */
  startKey: string
  endKey: string
  /** 여행인가 — 색·아이콘이 갈리고, **하루짜리여도 막대로 그린다**. */
  isTrip: boolean
}

export type WeekSpan = {
  item: SpanItem
  /** 이 주에서 차지하는 칸 범위(0~6, 양끝 포함). */
  startCol: number
  endCol: number
  /** 몇 번째 줄에 놓이는가(0부터). 겹치는 막대끼리 다른 줄을 쓴다. */
  lane: number
  /** 이 주 **앞으로** 이어지는가 — 참이면 왼쪽 모서리를 깎지 않는다. */
  continuesLeft: boolean
  /** 이 주 **뒤로** 이어지는가. */
  continuesRight: boolean
}

/** 일정 회차 하나를 막대 후보로. */
export function spanOfEvent(e: { id: string; title: string; start: string; end: string }): SpanItem {
  return { id: e.id, title: e.title, startKey: dayKey(e.start), endKey: dayKey(e.end), isTrip: false }
}

/** 여행 하나를 막대 후보로. 이벤트를 만들지 않는다 — 여행 행에서 바로 온다. */
export function spanOfTrip(t: { id: string; title: string; start_date: string; end_date: string }): SpanItem {
  return { id: `trip:${t.id}`, title: t.title, startKey: t.start_date, endKey: t.end_date, isTrip: true }
}

/** 그 회차가 여러 날에 걸쳐 있는가.
 *
 *  종일 일정은 마지막 날 23:59에 끝나므로 날짜 키로 비교하면 정확하다.
 *  자정을 넘기는 시각 일정(23:00~01:00)도 두 날에 걸친 것이 맞다. */
export function spansDays(e: { start: string; end: string }): boolean {
  return dayKey(e.start) !== dayKey(e.end)
}

/** weekKeys(7개, 일요일 시작)에 놓일 막대들.
 *
 *  items는 그 주에 **조금이라도 걸치는** 것들이면 된다(중복은 id로 걸러진다).
 *  정렬은 여행 먼저, 그다음 시작이 이른 순 → 긴 순 → id. 동점을 안 깨면 다시 그릴 때마다
 *  줄 순서가 바뀐다. */
export function weekSpans(weekKeys: string[], items: SpanItem[]): WeekSpan[] {
  if (weekKeys.length !== 7) return []
  const first = weekKeys[0]!
  const last = weekKeys[6]!

  const candidates = new Map<string, SpanItem>()
  for (const it of items) {
    // 하루짜리 **일정**은 칸 안에 블록으로 그린다 — 막대가 아니다.
    // 여행은 당일치기라도 막대다. 그 자체가 하나의 일이라 이름이 보여야 한다.
    if (!it.isTrip && it.startKey === it.endKey) continue
    if (it.endKey < first || it.startKey > last) continue
    candidates.set(it.id, it)
  }
  if (candidates.size === 0) return []

  const sorted = [...candidates.values()].sort((a, b) => {
    // 여행이 위 — 그 주의 얼개라 먼저 읽혀야 한다.
    if (a.isTrip !== b.isTrip) return a.isTrip ? -1 : 1
    if (a.startKey !== b.startKey) return a.startKey < b.startKey ? -1 : 1
    if (a.endKey !== b.endKey) return a.endKey > b.endKey ? -1 : 1 // 긴 것이 위
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  // 줄 배정 — 각 줄이 어디까지 찼는지만 들고 다니면 된다(막대는 왼→오 순으로 온다).
  const laneEnd: number[] = []
  const out: WeekSpan[] = []
  for (const item of sorted) {
    const startCol = item.startKey <= first ? 0 : weekKeys.indexOf(item.startKey)
    const endCol = item.endKey >= last ? 6 : weekKeys.indexOf(item.endKey)
    // 인덱스를 못 찾는 건 키 형식이 어긋났을 때뿐이다 — 그 막대는 그리지 않는다.
    if (startCol < 0 || endCol < 0 || endCol < startCol) continue

    let lane = 0
    while (lane < laneEnd.length && laneEnd[lane]! >= startCol) lane++
    if (lane === laneEnd.length) laneEnd.push(endCol)
    else laneEnd[lane] = endCol

    out.push({
      item,
      startCol,
      endCol,
      lane,
      continuesLeft: item.startKey < first,
      continuesRight: item.endKey > last,
    })
  }
  return out
}

/** 그 주가 쓰는 줄 수 — 칸이 위에 비워 둘 높이를 정한다. */
export function laneCount(spans: WeekSpan[]): number {
  return spans.length === 0 ? 0 : Math.max(...spans.map((s) => s.lane)) + 1
}

/** **그 칸**을 지나는 막대가 쓰는 줄 수 — 칸이 위에 비워 둘 높이를 정한다.
 *
 *  laneCount는 주 전체의 줄 수라, 막대가 월~수만 지나는 주에서 일·목·금·토 칸까지 위를
 *  비웠다("27일은 막대가 없는데 왜 위가 비지"). 칸마다 제 것만 센다. 줄 번호는 겹침으로
 *  정해지므로 1번 줄만 지나는 칸도 0번 줄 자리는 비워야 한다 — "가장 아래 줄 번호 + 1". */
export function laneCountAt(spans: WeekSpan[], col: number): number {
  let lanes = 0
  for (const s of spans) {
    if (s.startCol <= col && col <= s.endCol && s.lane + 1 > lanes) lanes = s.lane + 1
  }
  return lanes
}
