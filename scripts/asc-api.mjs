#!/usr/bin/env node
// App Store Connect API 최소 클라이언트 — 심사 제출 전 메타데이터를 손 대신 채운다.
//
// 왜 만드나: 방침 URL·테스트 정보·심사 노트는 매번 웹 UI에서 손으로 넣는 것들인데,
// 값의 출처가 저장소 안에 있다(방침 URL은 .env, 백그라운드 위치 사유는 Info.plist).
// 손으로 옮기면 어긋나고, 어긋나면 심사에서 걸린다. 출처에서 바로 밀어 넣는다.
//
// 인증: .p8(ES256)로 JWT를 직접 서명한다. 라이브러리를 안 쓰는 이유는 Node crypto가
// dsaEncoding:'ieee-p1363'을 지원해 JOSE가 요구하는 R||S 원시 형식을 바로 주기 때문이다
// (기본 DER로 서명하면 Apple이 401로 거절한다 — 이게 직접 구현할 때 가장 흔한 함정이다).
//
//   node scripts/asc-api.mjs whoami                      인증 확인 + 앱 목록
//   node scripts/asc-api.mjs show <appId>                현재 메타데이터 읽기
//   node scripts/asc-api.mjs set-review <appId>          방침 URL·테스트 정보·심사 노트 쓰기

import { createSign } from 'node:crypto'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function loadEnv(file) {
  const p = join(ROOT, file)
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"\n]*?)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnv('.env.release')
loadEnv('.env')

const KEY_DIR = join(homedir(), '.appstoreconnect/private_keys')
const keyFile = existsSync(KEY_DIR)
  ? readdirSync(KEY_DIR).find((f) => f.startsWith('AuthKey_') && f.endsWith('.p8'))
  : null
const KEY_ID = process.env.ASC_KEY_ID
const ISSUER = process.env.ASC_ISSUER_ID
if (!keyFile || !KEY_ID || !ISSUER) {
  console.error('ASC 자격증명이 없습니다 (.env.release의 ASC_KEY_ID/ASC_ISSUER_ID + ~/.appstoreconnect/private_keys/*.p8)')
  process.exit(1)
}
const PRIVATE_KEY = readFileSync(join(KEY_DIR, keyFile), 'utf8')

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

function token() {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' }
  // aud는 고정값, exp는 20분 이내여야 한다(Apple 제한).
  const payload = { iss: ISSUER, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }
  const signing = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = createSign('SHA256').update(signing).sign({ key: PRIVATE_KEY, dsaEncoding: 'ieee-p1363' })
  return `${signing}.${b64url(sig)}`
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const detail = (body.errors ?? []).map((e) => `${e.title}: ${e.detail}`).join('\n  ') || text
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}\n  ${detail}`)
  }
  return body
}

const [cmd, appId] = process.argv.slice(2)

if (cmd === 'whoami') {
  const apps = await api('/v1/apps?limit=50')
  console.log('인증 OK. 앱 목록:')
  for (const a of apps.data) {
    console.log(`  ${a.id}  ${a.attributes.name}  (${a.attributes.bundleId})`)
  }
  process.exit(0)
}

if (!appId) {
  console.error('앱 ID가 필요합니다. `node scripts/asc-api.mjs whoami` 로 확인하세요.')
  process.exit(1)
}

if (cmd === 'show') {
  const [infos, betaLoc, betaDetail] = await Promise.all([
    api(`/v1/apps/${appId}/appInfos`),
    api(`/v1/apps/${appId}/betaAppLocalizations`).catch(() => ({ data: [] })),
    api(`/v1/apps/${appId}/betaAppReviewDetail`).catch(() => ({ data: null })),
  ])
  for (const info of infos.data) {
    const locs = await api(`/v1/appInfos/${info.id}/appInfoLocalizations`)
    for (const l of locs.data) {
      console.log(`[앱 정보 ${l.attributes.locale}] 개인정보처리방침 URL: ${l.attributes.privacyPolicyUrl ?? '(없음)'}`)
    }
  }
  for (const l of betaLoc.data) {
    console.log(`[베타 ${l.attributes.locale}] 피드백: ${l.attributes.feedbackEmail ?? '(없음)'} / 설명: ${(l.attributes.description ?? '(없음)').slice(0, 40)}…`)
  }
  const d = betaDetail.data
  console.log(`[심사 상세] 데모 계정 필요: ${d?.attributes?.demoAccountRequired ?? '(없음)'} / 계정: ${d?.attributes?.demoAccountName ?? '(없음)'}`)
  process.exit(0)
}

if (cmd === 'set-review') {
  const site = (process.env.VITE_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
  if (!site) throw new Error('VITE_PUBLIC_SITE_URL이 없습니다(.env)')
  const base = site.startsWith('http') ? site : `https://${site}`
  const privacyUrl = `${base}/privacy`

  const demoName = process.env.ASC_DEMO_ACCOUNT ?? ''
  const demoPass = process.env.ASC_DEMO_PASSWORD ?? ''
  const feedback = process.env.ASC_FEEDBACK_EMAIL ?? process.env.ASC_DEMO_ACCOUNT ?? ''

  // 1) 개인정보처리방침 URL — 로케일마다 따로 들어간다.
  const infos = await api(`/v1/apps/${appId}/appInfos`)
  for (const info of infos.data) {
    const locs = await api(`/v1/appInfos/${info.id}/appInfoLocalizations`)
    for (const l of locs.data) {
      await api(`/v1/appInfoLocalizations/${l.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          data: { type: 'appInfoLocalizations', id: l.id, attributes: { privacyPolicyUrl: privacyUrl } },
        }),
      })
      console.log(`✓ 방침 URL (${l.attributes.locale}): ${privacyUrl}`)
    }
  }

  // 2) 베타 앱 설명·피드백 이메일
  const betaLocs = await api(`/v1/apps/${appId}/betaAppLocalizations`)
  const description = [
    'Weave는 둘이 함께 다닌 길을 기록하는 커플 여행 앱입니다.',
    '',
    '· 여행 중 이동 동선을 GPS로 기록하고, 지나온 길을 지도에 그립니다.',
    '· 다녀온 장소가 쌓이면 전국 지도가 채워집니다.',
    '· 기록한 동선과 지도를 이미지 카드로 만들어 공유할 수 있습니다.',
    '',
    '두 사람이 초대 코드로 연결되면 장소·일정·사진·동선을 함께 봅니다.',
  ].join('\n')

  // 로컬라이제이션이 하나도 없을 수 있다(앱 레코드만 만들고 빌드 전인 상태). 그땐 만든다.
  if (betaLocs.data.length === 0) {
    await api('/v1/betaAppLocalizations', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'betaAppLocalizations',
          attributes: { locale: 'ko', description, feedbackEmail: feedback || undefined },
          relationships: { app: { data: { type: 'apps', id: appId } } },
        },
      }),
    })
    console.log('✓ 베타 설명 (ko, 새로 만듦)')
  } else {
    for (const l of betaLocs.data) {
      await api(`/v1/betaAppLocalizations/${l.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          data: {
            type: 'betaAppLocalizations',
            id: l.id,
            attributes: { description, feedbackEmail: feedback || undefined },
          },
        }),
      })
      console.log(`✓ 베타 설명 (${l.attributes.locale})`)
    }
  }

  // 3) 심사 상세 — 데모 계정 + 백그라운드 위치 사유.
  //    로그인이 필요한 앱은 데모 계정이 없으면 그 자리에서 반려된다.
  const notes = [
    '[로그인 방법]',
    '로그인 화면 하단 "비밀번호로 로그인"을 눌러 펼친 뒤,',
    '아래 데모 계정의 이메일과 비밀번호로 로그인해 주세요.',
    '(매직링크·소셜 로그인은 심사에 적합하지 않아 비밀번호 경로를 별도로 제공합니다.)',
    '',
    '[백그라운드 위치 사용 사유]',
    '여행 중 이동 동선을 기록하는 것이 이 앱의 핵심 기능입니다.',
    '사용자가 "동선 시작"을 직접 누른 동안에만 수집하며, "종료"를 누르면 즉시 중단됩니다.',
    '상시 추적하지 않고, 배터리를 위해 일정 이동거리마다 간헐 샘플링합니다.',
    '수집 전 앱 내에서 목적·보관기간·제3자(연결된 상대) 제공에 대한 분리 동의를 받습니다.',
    '동의는 언제든 철회할 수 있고, 철회 시 기록된 동선을 파기합니다.',
    '',
    '[참고]',
    '두 사람이 연결되어야 완전한 경험이 되지만, 혼자서도 모든 기능을 사용할 수 있습니다.',
  ].join('\n')

  // Apple이 연락처 4종(성·이름·전화·이메일)을 **전부** 요구한다. 하나라도 없으면 요청 전체가
  // 거절되므로, 없으면 여기서 멈추고 무엇이 없는지 말한다(방침 URL·베타 설명은 이미 반영됐다).
  const first = process.env.ASC_CONTACT_FIRST ?? ''
  const last = process.env.ASC_CONTACT_LAST ?? ''
  const phone = process.env.ASC_CONTACT_PHONE ?? ''
  const missing = [
    !first && 'ASC_CONTACT_FIRST(이름)',
    !last && 'ASC_CONTACT_LAST(성)',
    !phone && 'ASC_CONTACT_PHONE(전화)',
    !feedback && 'ASC_FEEDBACK_EMAIL(이메일)',
  ].filter(Boolean)
  if (missing.length > 0) {
    console.log(`· 심사 상세는 건너뜁니다 — .env.release에 다음이 필요합니다: ${missing.join(', ')}`)
    process.exit(0)
  }

  const detail = await api(`/v1/apps/${appId}/betaAppReviewDetail`)
  const id = detail.data.id
  await api(`/v1/betaAppReviewDetails/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'betaAppReviewDetails',
        id,
        attributes: {
          demoAccountRequired: Boolean(demoName),
          demoAccountName: demoName || undefined,
          demoAccountPassword: demoPass || undefined,
          notes,
          contactFirstName: first,
          contactLastName: last,
          contactPhone: phone,
          contactEmail: feedback,
        },
      },
    }),
  })
  console.log(demoName ? '✓ 심사 상세(데모 계정 + 위치 사유)' : '✓ 심사 상세(위치 사유) — 데모 계정은 아직 비어 있음')
  process.exit(0)
}

console.error('사용법: whoami | show <appId> | set-review <appId>')
process.exit(1)
