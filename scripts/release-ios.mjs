#!/usr/bin/env node
// TestFlight 릴리스 — 게이트 → 빌드번호 증가 → 웹 번들 동기화 → 아카이브 → 업로드.
//
//   npm run release:ios              전체
//   npm run release:ios -- --dry     업로드 직전까지만(아카이브까지 확인)
//   npm run release:ios -- --fast    게이트 생략(직전에 이미 돌렸을 때만)
//
// 왜 스크립트인가: 이 흐름엔 조용히 틀리는 자리가 셋 있다.
//   ① build:native를 빼먹으면 **옛 웹 번들**이 그대로 올라간다(앱은 성공적으로 빌드된다).
//   ② 빌드 번호를 안 올리면 업로드가 거부된다(같은 번호 재업로드 금지).
//   ③ 시뮬레이터 destination으로는 Archive가 안 된다 — generic/platform=iOS여야 한다.
// 셋 다 사람이 기억할 일이 아니다.
//
// 사전 준비(사람이 한 번만):
//   1. Xcode → Settings → Accounts에 Apple ID 추가
//   2. Xcode에서 App 타깃 → Signing & Capabilities → Team 선택 + Automatically manage signing
//      (이때 인증서·프로파일이 생긴다. 이게 없으면 이 스크립트가 멈추고 그렇게 말한다.)
//   3. App Store Connect에 앱 레코드 생성(번들 ID app.loveplace)
//   4. App Store Connect API 키(.p8) 발급 → ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8
//      그리고 .env.release에 ASC_KEY_ID / ASC_ISSUER_ID

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const IOS = join(ROOT, 'ios/App')
const PBXPROJ = join(IOS, 'App.xcodeproj/project.pbxproj')
const SCHEME = 'App'

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const FAST = args.includes('--fast')

let step = 0
const say = (msg) => console.log(`\n\x1b[1m▸ ${msg}\x1b[0m`)
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
const die = (msg, hint) => {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m`)
  if (hint) console.error(`\n${hint}\n`)
  process.exit(1)
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', cwd: ROOT, ...opts })
  if (r.status !== 0) die(`${cmd} ${cmdArgs.slice(0, 2).join(' ')} 실패 (exit ${r.status})`)
  return r
}
function capture(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { encoding: 'utf8', cwd: ROOT, ...opts })
}

// ── 0. 사전 점검 ────────────────────────────────────────────────
say(`${++step}. 사전 점검`)

// 서명: 인증서가 하나도 없으면 아카이브가 알 수 없는 에러로 죽는다. 여기서 사람 말로 멈춘다.
const ids = capture('security', ['find-identity', '-v', '-p', 'codesigning']).stdout ?? ''
if (/0 valid identities found/.test(ids)) {
  die(
    '코드서명 인증서가 없습니다.',
    [
      'Xcode에서 한 번만 해주세요:',
      '  1) Xcode → Settings → Accounts → + → Apple ID 로그인',
      '  2) npm run cap:ios → App 타깃 → Signing & Capabilities',
      '     → Team 선택 + "Automatically manage signing" 체크',
      '  인증서와 프로비저닝 프로파일이 그때 자동으로 만들어집니다.',
    ].join('\n'),
  )
}
ok(`코드서명 인증서 ${(ids.match(/^\s+\d\)/gm) ?? []).length}개`)

// App Store Connect API 키 — 없으면 업로드 단계에서만 막는다(아카이브까지는 유용하므로).
const envFile = join(ROOT, '.env.release')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const KEY_DIR = join(homedir(), '.appstoreconnect/private_keys')
const keyFile = existsSync(KEY_DIR)
  ? readdirSync(KEY_DIR).find((f) => f.startsWith('AuthKey_') && f.endsWith('.p8'))
  : null
const KEY_ID = process.env.ASC_KEY_ID ?? keyFile?.replace(/^AuthKey_|\.p8$/g, '')
const ISSUER = process.env.ASC_ISSUER_ID
const canUpload = Boolean(keyFile && KEY_ID && ISSUER)
if (canUpload) ok(`App Store Connect API 키 ${KEY_ID}`)
else console.log('  · API 키 없음 → 아카이브까지만 진행합니다(업로드 생략)')

// ── 1. 게이트 ───────────────────────────────────────────────────
if (FAST) {
  console.log('\n  · --fast: 게이트를 건너뜁니다(직전에 통과했을 때만 쓰세요)')
} else {
  say(`${++step}. 게이트 (typecheck · lint · test · build · e2e · 시크릿)`)
  run('npm', ['run', 'typecheck'])
  run('npm', ['run', 'lint'])
  run('npm', ['test'])
  run('npm', ['run', 'build'])
  run('npm', ['run', 'check:secrets'])
  run('npm', ['run', 'e2e'])
  ok('전부 통과')
}

// ── 2. 빌드 번호 증가 ───────────────────────────────────────────
say(`${++step}. 빌드 번호 증가`)
let pbx = readFileSync(PBXPROJ, 'utf8')
const cur = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1]))
if (cur.length === 0) die('CURRENT_PROJECT_VERSION을 찾지 못했습니다.')
const next = Math.max(...cur) + 1
pbx = pbx.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`)
writeFileSync(PBXPROJ, pbx)
const marketing = /MARKETING_VERSION = ([^;]+);/.exec(pbx)?.[1] ?? '?'
ok(`${marketing} (${Math.max(...cur)} → ${next})`)

// ── 3. 웹 번들 동기화 ───────────────────────────────────────────
// ⚠️ 이걸 빼먹으면 옛 dist가 그대로 감싸져 나간다. 빌드는 성공하므로 눈치채기 어렵다.
//    (게이트의 e2e가 dist를 e2e용으로 덮어쓰기 때문에 **게이트 뒤에** 와야 한다.)
say(`${++step}. 웹 번들 빌드 + cap sync`)
run('npm', ['run', 'build:native'])
ok('dist → ios/App/App/public')

// ── 4. 아카이브 ─────────────────────────────────────────────────
say(`${++step}. 아카이브 (Release)`)
const archive = join(ROOT, `.release/${SCHEME}-${next}.xcarchive`)
run(
  'xcodebuild',
  [
    'archive',
    '-project', 'App.xcodeproj',
    '-scheme', SCHEME,
    '-configuration', 'Release',
    // 시뮬레이터 destination으로는 Archive가 안 된다 — 이걸 몰라 Archive 메뉴가 비활성인 줄 아는 경우가 많다.
    '-destination', 'generic/platform=iOS',
    '-archivePath', archive,
  ],
  { cwd: IOS },
)
ok(archive.replace(ROOT, ''))

// ── 5. 업로드 ───────────────────────────────────────────────────
if (DRY || !canUpload) {
  say('업로드는 건너뜁니다')
  if (!canUpload) {
    console.log(
      [
        '  App Store Connect API 키를 넣으면 여기서 바로 업로드합니다:',
        '   1) appstoreconnect.apple.com → 사용자 및 액세스 → 통합 → App Store Connect API',
        '   2) 키 생성(역할: App Manager) → .p8 다운로드(**한 번만 받을 수 있습니다**)',
        `   3) mkdir -p ${KEY_DIR} && mv ~/Downloads/AuthKey_*.p8 ${KEY_DIR}/`,
        '   4) .env.release 에  ASC_KEY_ID=...  ASC_ISSUER_ID=...',
      ].join('\n'),
    )
  }
} else {
  say(`${++step}. App Store Connect 업로드`)
  run(
    'xcodebuild',
    [
      '-exportArchive',
      '-archivePath', archive,
      '-exportOptionsPlist', join(IOS, 'ExportOptions.plist'),
      '-allowProvisioningUpdates',
      '-authenticationKeyPath', join(KEY_DIR, keyFile),
      '-authenticationKeyID', KEY_ID,
      '-authenticationKeyIssuerID', ISSUER,
    ],
    { cwd: IOS },
  )
  ok('업로드 완료')
}

// ── 6. 릴리스 노트 초안 ─────────────────────────────────────────
// TestFlight '이 빌드에서 테스트할 항목'에 붙여넣을 초안. 직전 빌드 이후의 커밋 제목에서 뽑는다.
say('릴리스 노트 초안')
const log = capture('git', ['log', '-12', '--pretty=%s']).stdout ?? ''
const notes = log
  .split('\n')
  .filter(Boolean)
  .filter((l) => !/^(chore|docs|test|ci)[:(]/.test(l))
  .slice(0, 6)
  .map((l) => `· ${l.replace(/^[a-z]+(\([^)]*\))?:\s*/, '')}`)
  .join('\n')
console.log(`\n${notes || '· (커밋 제목 없음)'}\n`)

console.log(
  [
    '\x1b[1m다음\x1b[0m',
    `  빌드 ${marketing} (${next})가 App Store Connect에서 처리되기까지 보통 5~30분입니다.`,
    '  TestFlight → 내부 테스팅 그룹에 상대를 추가하면 심사 없이 바로 설치됩니다.',
    '  빌드는 90일 뒤 만료되니 그때 다시 이 명령을 돌리면 됩니다.',
  ].join('\n'),
)
