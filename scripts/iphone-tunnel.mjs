#!/usr/bin/env node
// 아이폰에서 PWA로 "진짜 동작"(설치·서비스워커·위치·카카오맵)을 확인하기 위한 HTTPS 터널.
// - 프로덕션 빌드(dist)를 vite preview로 서빙
// - cloudflared로 임시 https URL 생성(*.trycloudflare.com)
// - 그 URL을 출력 + QR 렌더 → 아이폰 카메라로 스캔
//
// iOS는 https(또는 localhost)에서만 서비스워커·"홈 화면에 추가"·위치를 허용하므로,
// PWA로서의 동작 확인은 LAN(http)이 아니라 이 터널이 필요하다.
//
// 사용: npm run build && npm run iphone:tunnel   (또는 이 스크립트가 build를 안 했으면 먼저 빌드)

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = process.env.PORT || 4173
const root = fileURLToPath(new URL('..', import.meta.url))

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, { stdio: 'inherit', cwd: root, ...opts })
}

function ensureCloudflared() {
  return new Promise((resolve) => {
    const check = spawn('cloudflared', ['--version'], { stdio: 'ignore' })
    check.on('error', () => resolve(false))
    check.on('exit', (code) => resolve(code === 0))
  })
}

async function main() {
  if (!(await ensureCloudflared())) {
    console.error('✗ cloudflared가 없어요. 설치: brew install cloudflared')
    process.exit(1)
  }

  if (!existsSync(`${root}/dist/sw.js`)) {
    console.error('✗ dist/가 없어요(서비스워커 미생성). 먼저: npm run build')
    process.exit(1)
  }

  console.log('\n  프로덕션 PWA를 preview로 서빙합니다 (포트 ' + PORT + ')…')
  const preview = run('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'])

  // preview가 뜰 시간을 잠깐 주고 터널 시작.
  await new Promise((r) => setTimeout(r, 2500))

  console.log('  cloudflared 터널을 엽니다… (https 주소가 곧 나와요)\n')
  // --no-autoupdate: 매번 업데이트 시도 방지. 출력에서 trycloudflare URL을 파싱해 QR로 표시.
  const tunnel = spawn(
    'cloudflared',
    ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`],
    { cwd: root },
  )

  let shown = false
  const onData = async (buf) => {
    const text = buf.toString()
    process.stderr.write(text) // cloudflared 로그 그대로 보여주기
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
    if (m && !shown) {
      shown = true
      const url = m[0]
      console.log('\n┌─────────────────────────────────────────────┐')
      console.log('│  아이폰에서 PWA로 열기 (HTTPS)               │')
      console.log('└─────────────────────────────────────────────┘')
      console.log(`\n  주소:  ${url}`)
      console.log('  ↳ 아이폰 Safari로 열고 → 공유 → "홈 화면에 추가"\n')
      try {
        const { default: qr } = await import('qrcode-terminal')
        qr.generate(url, { small: true }, (c) => process.stdout.write(c + '\n'))
      } catch {
        console.log('  (QR 렌더 실패 — 위 주소를 아이폰에 직접 입력하세요.)\n')
      }
    }
  }
  tunnel.stdout.on('data', onData)
  tunnel.stderr.on('data', onData)

  const shutdown = () => {
    tunnel.kill('SIGINT')
    preview.kill('SIGINT')
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  tunnel.on('exit', shutdown)
  preview.on('exit', shutdown)
}

main()
