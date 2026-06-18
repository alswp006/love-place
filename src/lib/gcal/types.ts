// 구글 캘린더 연동(gcal-proxy) 클라이언트 타입 — 프록시 응답과 1:1.
// 읽기전용 오버레이 · 둘 다 보기. refresh token 등 비밀은 클라이언트에 절대 오지 않는다(서버 전용).

// 프록시가 정규화해 내려주는 일정(읽기전용). start/end 는 ISO datetime 또는 YYYY-MM-DD(종일).
export type GcalEvent = {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  ownerId: string // 누구의 구글 캘린더 일정인가(색·라벨 도출)
  color: string
  calendarSummary: string
  source: 'GOOGLE'
  htmlLink?: string
}

// 커플 양쪽의 연결 메타데이터(둘 다 보기).
export type GcalConnection = {
  ownerId: string
  providerEmail: string | null
  googleCalendarId: string | null // 선택 전 null
  calendarSummary: string | null
  color: string
  isEnabled: boolean
  isMine: boolean
}

// 선택 화면용 내 구글 캘린더 목록.
export type GcalCalendar = {
  id: string
  summary: string
  primary: boolean
  backgroundColor: string | null
  accessRole: string | null
}
