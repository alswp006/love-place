#!/usr/bin/env node
// 아이폰(같은 WiFi)에서 dev 서버를 열기 위한 헬퍼.
// - Mac의 LAN IP를 자동 탐지해 URL을 출력
// - 터미널에 QR 코드를 그려, 아이폰 카메라로 스캔 → 바로 Safari로 열림
// - 이어서 `vite --host`(dev) 서버를 띄움
//
// 주의: 이건 http라 "모양·탭 이동·레이아웃" 확인용. PWA 설치/서비스워커/위치는 https가 필요
// (그건 npm run iphone:tunnel 사용). iOS Safari는 http 원격 출처에서 서비스워커를 등록하지 않음.

import { networkInterfaces } from 'node:os'
import { spawn } from 'node:child_process'

const PORT = process.env.PORT || 5173

function lanIPv4() {
  const nets = networkInterfaces()
  // en0(보통 WiFi) 우선, 그다음 사설 IPv4 아무거나.
  const order = ['en0', 'en1', ...Object.keys(nets)]
  const seen = new Set()
  for (const name of order) {
    if (seen.has(name)) continue
    seen.add(name)
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ni.address)) {
        return ni.address
      }
    }
  }
  return null
}

const ip = lanIPv4()
if (!ip) {
  console.error('✗ LAN IPv4를 찾지 못했어요. WiFi에 연결돼 있는지 확인하세요.')
  process.exit(1)
}

const url = `http://${ip}:${PORT}`

console.log('\n┌─────────────────────────────────────────────┐')
console.log('│  아이폰에서 열기 (같은 WiFi 필요)            │')
console.log('└─────────────────────────────────────────────┘')
console.log(`\n  주소:  ${url}`)
console.log('  ↳ 아이폰 카메라로 아래 QR을 비추면 Safari로 바로 열려요.\n')

// QR을 터미널에 렌더(로컬 devDependency, 실패 시 주소만 안내).
async function printQR() {
  try {
    const { default: qr } = await import('qrcode-terminal')
    await new Promise((resolve) => qr.generate(url, { small: true }, (c) => {
      process.stdout.write(c + '\n')
      resolve()
    }))
  } catch {
    console.log('  (QR 렌더 실패 — 위 주소를 아이폰에 직접 입력하세요.)\n')
  }
}

await printQR()
console.log('\n  dev 서버를 시작합니다… (Ctrl+C로 종료)\n')
// vite --host: 0.0.0.0 바인딩이라 LAN의 아이폰이 접속 가능.
const vite = spawn('npx', ['vite', '--host', '--port', String(PORT)], { stdio: 'inherit' })
vite.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => vite.kill('SIGINT'))
