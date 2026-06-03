#!/usr/bin/env node
// 빌드 산출물(dist/)에 비밀키가 새지 않았는지 검사(§10.1 — 키 클라이언트 금지).
// anon 키는 공개 전제라 OK. service_role·카카오 REST·Anthropic 키 등은 절대 번들에 있으면 안 됨.
// CI/제출 게이트에 포함. 빌드 먼저: npm run build && node scripts/check-bundle-secrets.mjs

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
if (!existsSync(DIST)) {
  console.error('✗ dist/ 가 없어요. 먼저 npm run build 하세요.')
  process.exit(1)
}

// 번들에서 발견되면 안 되는 비밀 패턴들.
const FORBIDDEN = [
  { name: 'Supabase service_role JWT (role 클레임)', re: /"role"\s*:\s*"service_role"/ },
  { name: 'service_role 문자열', re: /service_role/ },
  // Anthropic 키
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  // 카카오 REST/Admin 키는 보통 환경변수명으로 흘러들어옴 — 흔적 차단
  { name: 'KAKAO_REST_KEY 변수 노출', re: /KAKAO_REST_KEY/ },
  { name: 'ANTHROPIC_API_KEY 변수 노출', re: /ANTHROPIC_API_KEY/ },
  { name: 'SUPABASE_SERVICE_ROLE 변수 노출', re: /SUPABASE_SERVICE_ROLE/ },
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (/\.(js|css|html|map|webmanifest|json)$/.test(entry)) out.push(p)
  }
  return out
}

const files = walk(DIST)
const hits = []
for (const f of files) {
  const text = readFileSync(f, 'utf-8')
  for (const { name, re } of FORBIDDEN) {
    if (re.test(text)) hits.push({ file: f, name })
  }
}

if (hits.length) {
  console.error('✗ 번들에서 비밀로 의심되는 문자열이 발견됐어요(클라이언트 노출 금지, §10.1):')
  for (const h of hits) console.error(`   - ${h.name}  @ ${h.file}`)
  process.exit(1)
}

console.log(`✓ 번들 비밀키 검사 통과 (${files.length}개 파일 스캔, 누출 0)`)
