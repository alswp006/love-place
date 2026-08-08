#!/usr/bin/env node
// 시뮬레이터 위치 조작 헬퍼 — 지도·동선 기록을 손으로 확인할 때 쓴다.
//
// 왜 필요한가: 시뮬레이터 기본 위치는 **쿠퍼티노(애플 본사)**다. 그대로 켜면 지도가
// 캘리포니아 도로망을 그리고 우리 장소는 화면 밖이라, 지도가 고장난 것처럼 보인다.
// 실제로 그걸로 한참 헤맸다. 앱 문제가 아니라 시뮬레이터 상태 문제다.
//
//   node scripts/sim-location.mjs set [서울|속초|위도,경도]   위치 고정
//   node scripts/sim-location.mjs walk [프리셋|좌표...]        걷기 속도로 이동(동선 기록 검증)
//   node scripts/sim-location.mjs drive [...]                  차 속도로 이동
//   node scripts/sim-location.mjs clear                        시뮬레이션 해제
//
// walk/drive는 켜 둔 채로 앱에서 '여행 시작 → 동선 기록'을 눌러야 점이 쌓인다.
// Ctrl+C로 멈추면 위치는 마지막 지점에 남는다(clear로 원복).

import { spawn, spawnSync } from 'node:child_process'

const PRESETS = {
  서울: ['37.5665,126.9780'],
  시청: ['37.5665,126.9780'],
  속초: ['38.2070,128.5918'],
  // 시청 → 덕수궁 → 광화문 → 경복궁. 동선이 꺾여야 폴리라인이 제대로 그려지는지 보인다.
  광화문코스: ['37.5665,126.9780', '37.5658,126.9751', '37.5720,126.9769', '37.5796,126.9770'],
  // 속초 해안 산책 — 칠성조선소 → 아바이마을 → 속초해수욕장.
  속초코스: ['38.2070,128.5918', '38.2010,128.5995', '38.1905,128.6040'],
}

function bootedDevice() {
  const r = spawnSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' })
  if (r.status !== 0) return null
  const all = Object.values(JSON.parse(r.stdout).devices).flat()
  return all.find((d) => d.state === 'Booted') ?? null
}

function resolveWaypoints(args) {
  if (args.length === 0) return PRESETS['서울']
  // 프리셋 이름 하나만 왔으면 그걸로, 아니면 받은 좌표를 그대로.
  const preset = PRESETS[args[0]]
  if (preset && args.length === 1) return preset
  const bad = args.filter((a) => !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(a))
  if (bad.length) {
    console.error(`좌표 형식이 아닙니다: ${bad.join(' ')}`)
    console.error(`쓸 수 있는 프리셋: ${Object.keys(PRESETS).join(' · ')}`)
    process.exit(1)
  }
  return args
}

const [action = 'set', ...rest] = process.argv.slice(2)
const device = bootedDevice()
if (!device) {
  console.error('부팅된 시뮬레이터가 없습니다. Simulator.app을 먼저 켜세요.')
  process.exit(1)
}
console.log(`▸ ${device.name} (${device.udid})`)

if (action === 'clear') {
  spawnSync('xcrun', ['simctl', 'location', device.udid, 'clear'], { stdio: 'inherit' })
  console.log('위치 시뮬레이션 해제 — 기본값(쿠퍼티노)으로 돌아갑니다.')
  process.exit(0)
}

const waypoints = resolveWaypoints(rest)

if (action === 'set') {
  const at = waypoints[0]
  spawnSync('xcrun', ['simctl', 'location', device.udid, 'set', at], { stdio: 'inherit' })
  console.log(`위치 고정: ${at}`)
  console.log('앱을 다시 띄우면 지도가 그 위치로 잡힙니다.')
  process.exit(0)
}

if (action === 'walk' || action === 'drive') {
  if (waypoints.length < 2) {
    console.error(`${action}에는 좌표가 2개 이상 필요합니다. 프리셋: 광화문코스 · 속초코스`)
    process.exit(1)
  }
  // 걷기 1.4m/s, 차 11m/s(≈40km/h). 1초 간격이면 distanceFilter15m를 걷기로도 넘긴다.
  const speed = action === 'walk' ? '1.4' : '11'
  console.log(`${action} 시작 (${speed}m/s, ${waypoints.length}개 지점). Ctrl+C로 중지.`)
  console.log('앱에서 여행 → 동선 기록을 켜 두면 점이 쌓입니다.')
  const p = spawn(
    'xcrun',
    ['simctl', 'location', device.udid, 'start', `--speed=${speed}`, '--interval=1', ...waypoints],
    { stdio: 'inherit' },
  )
  p.on('exit', (code) => process.exit(code ?? 0))
} else {
  console.error(`알 수 없는 명령: ${action} (set | walk | drive | clear)`)
  process.exit(1)
}
