#!/usr/bin/env node
// 심사용 데모 계정에 실제 데이터를 심는다.
//
// 왜 필요한가: 빈 앱은 "기능을 확인할 수 없다"로 반려되는 흔한 사유다. 심사관은 로그인해서
// **뭔가 보여야** 이 앱이 뭘 하는지 판단할 수 있다. 특히 이 앱의 핵심(동선·전국 지도)은
// 데이터가 없으면 빈 상태 문구만 나온다.
//
// 어떻게: service_role이 아니라 **데모 계정의 로그인 토큰**으로 넣는다. 그래야 RLS를 그대로
// 통과하며 심는 것이라, 심사관이 보는 것과 정확히 같은 데이터가 된다(관리자 권한으로 우겨
// 넣으면 RLS 밖의 데이터가 생겨 실제로는 안 보일 수 있다).
//
//   node scripts/seed-demo.mjs
//
// 멱등: 같은 kakao_place_id/제목이 이미 있으면 건너뛴다. 여러 번 돌려도 쌓이지 않는다.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const env = {}
for (const f of ['.env.release', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"\n]*?)"?\s*$/.exec(line)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2]
  }
}

const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const EMAIL = env.ASC_DEMO_ACCOUNT
const PASSWORD = env.ASC_DEMO_PASSWORD
if (!URL_ || !ANON || !EMAIL || !PASSWORD) {
  console.error('필요: VITE_SUPABASE_URL/ANON_KEY(.env), ASC_DEMO_ACCOUNT/PASSWORD(.env.release)')
  process.exit(1)
}

let TOKEN = ''
async function rest(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}\n  ${text}`)
  return body
}
const rpc = (name, args) =>
  rest(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args ?? {}) })

// ── 로그인 ──
const auth = await (
  await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
).json()
if (!auth.access_token) throw new Error(`데모 계정 로그인 실패: ${JSON.stringify(auth)}`)
TOKEN = auth.access_token
const UID = auth.user.id
console.log(`✓ 로그인 ${EMAIL}`)

// ── 커플 보장(0024 솔로 커플) ──
const ensured = await rpc('ensure_solo_couple')
const COUPLE = ensured?.couple_id
if (!COUPLE) throw new Error(`커플을 만들지 못했습니다: ${JSON.stringify(ensured)}`)
console.log(`✓ 커플 ${COUPLE}`)

await rest(`/rest/v1/profiles?id=eq.${UID}`, {
  method: 'PATCH',
  body: JSON.stringify({ display_name: '리뷰' }),
})

const audit = { couple_id: COUPLE, created_by: UID, updated_by: UID }

// ── 장소 ──
const PLACES = [
  { name: '칠성조선소', address: '강원 속초시 중앙로46번길 45', region_label: '속초', lat: 38.207, lng: 128.5918, category: '카페', kakao_place_id: 'demo-1' },
  { name: '아바이마을', address: '강원 속초시 청호동', region_label: '속초', lat: 38.201, lng: 128.5995, category: '관광', kakao_place_id: 'demo-2' },
  { name: '속초해수욕장', address: '강원 속초시 조양동', region_label: '속초', lat: 38.1905, lng: 128.604, category: '관광', kakao_place_id: 'demo-3' },
  { name: '안목해변 커피거리', address: '강원 강릉시 창해로14번길', region_label: '강릉', lat: 37.7715, lng: 128.9476, category: '카페', kakao_place_id: 'demo-4' },
]
const existing = await rest(`/rest/v1/places?couple_id=eq.${COUPLE}&select=id,kakao_place_id`)
const byKakao = new Map(existing.map((p) => [p.kakao_place_id, p.id]))
const placeIds = {}
for (const p of PLACES) {
  if (byKakao.has(p.kakao_place_id)) {
    placeIds[p.kakao_place_id] = byKakao.get(p.kakao_place_id)
    continue
  }
  const [row] = await rest('/rest/v1/places', {
    method: 'POST',
    body: JSON.stringify({ ...p, ...audit, added_by: UID }),
  })
  placeIds[p.kakao_place_id] = row.id
}
console.log(`✓ 장소 ${Object.keys(placeIds).length}곳`)

// ── 여행 ──
const today = new Date()
const iso = (d) => d.toISOString().slice(0, 10)
const start = new Date(today.getTime() - 21 * 86400000)
const end = new Date(today.getTime() - 20 * 86400000)
const trips = await rest(`/rest/v1/trips?couple_id=eq.${COUPLE}&select=id,title`)
let tripId = trips.find((t) => t.title === '속초 1박 2일')?.id
if (!tripId) {
  const [row] = await rest('/rest/v1/trips', {
    method: 'POST',
    body: JSON.stringify({ title: '속초 1박 2일', start_date: iso(start), end_date: iso(end), ...audit }),
  })
  tripId = row.id
}
console.log(`✓ 여행 ${tripId}`)

// ── 방문(가본 곳) — 전국 지도의 점이 된다 ──
const visits = await rest(`/rest/v1/visits?couple_id=eq.${COUPLE}&select=id,place_id`)
const visited = new Set(visits.map((v) => v.place_id))
for (const [key, date] of [
  ['demo-1', iso(start)],
  ['demo-2', iso(start)],
  ['demo-3', iso(end)],
  ['demo-4', iso(new Date(today.getTime() - 60 * 86400000))],
]) {
  const pid = placeIds[key]
  if (!pid || visited.has(pid)) continue
  await rest('/rest/v1/visits', {
    method: 'POST',
    body: JSON.stringify({
      place_id: pid,
      trip_id: key === 'demo-4' ? null : tripId,
      visit_date: date,
      rating: 5,
      ...audit,
    }),
  })
}
console.log('✓ 방문 기록')

// ── 일정 ──
const events = await rest(`/rest/v1/events?couple_id=eq.${COUPLE}&select=id,title`)
const at = (dayOffset, hour) => {
  const d = new Date(today.getTime() + dayOffset * 86400000)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
for (const [title, offset, hour] of [
  ['속초 카페 투어', -21, 11],
  ['해변 산책', -20, 17],
  ['다음 여행 계획하기', 3, 20],
]) {
  if (events.some((e) => e.title === title)) continue
  await rest('/rest/v1/events', {
    method: 'POST',
    body: JSON.stringify({
      title,
      // 컬럼명이 start / "end" 다(end는 예약어라 스키마에서 따옴표로 선언됨).
      start: at(offset, hour),
      end: at(offset, hour + 1),
      is_all_day: false,
      time_zone: 'Asia/Seoul',
      visibility: 'SHARED',
      participants: 'BOTH',
      owner_id: UID,
      reminders: [],
      ...audit,
    }),
  })
}
console.log('✓ 일정')

// ── 동선 ── 핵심 기능이라 심사관이 반드시 봐야 한다.
// record_points는 서버가 COLLECT_USE 동의를 강제하므로 동의 기록을 먼저 남긴다(설계 §5[2]).
const consents = await rest(`/rest/v1/consent_log?user_id=eq.${UID}&select=id,consent_type,granted`)
if (!consents.some((c) => c.consent_type === 'COLLECT_USE' && c.granted)) {
  await rest('/rest/v1/consent_log', {
    method: 'POST',
    body: JSON.stringify({
      user_id: UID,
      couple_id: COUPLE,
      consent_type: 'COLLECT_USE',
      scope: 'RECAP',
      granted: true,
      policy_version: 'demo',
      shown_text_hash: 'demo',
      granted_at: new Date().toISOString(),
      created_by: UID,
    }),
  })
}

const sessions = await rest(`/rest/v1/trip_sessions?couple_id=eq.${COUPLE}&select=id,status`)
if (sessions.length === 0) {
  const [session] = await rest('/rest/v1/trip_sessions', {
    method: 'POST',
    body: JSON.stringify({
      trip_id: tripId,
      owner_id: UID,
      status: 'RECORDING',
      started_at: at(-21, 10),
      ...audit,
    }),
  })
  // 속초 시내 도보 동선 — 살짝 흔들어 실제 GPS처럼.
  const path = []
  const from = [38.207, 128.5918]
  const to = [38.1905, 128.604]
  for (let i = 0; i < 60; i++) {
    const t = i / 59
    path.push({
      client_point_id: `demo:${i}`,
      recorded_at: new Date(Date.parse(at(-21, 10)) + i * 60000).toISOString(),
      lat: from[0] + (to[0] - from[0]) * t + Math.sin(i * 0.7) * 0.00035,
      lng: from[1] + (to[1] - from[1]) * t + Math.cos(i * 0.5) * 0.00045,
      accuracy_m: 8,
      speed_mps: 1.3,
    })
  }
  const n = await rpc('record_points', { p_session: session.id, p_points: path })
  await rest(`/rest/v1/trip_sessions?id=eq.${session.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'DONE',
      ended_at: at(-21, 12),
      recorded_distance_m: 2400,
      version: 2,
      updated_by: UID,
    }),
  })
  console.log(`✓ 동선 ${n}점`)
} else {
  console.log('· 동선 이미 있음')
}

console.log('\n데모 계정 준비 완료 — 심사관이 로그인하면 장소·여행·일정·동선이 모두 보입니다.')
