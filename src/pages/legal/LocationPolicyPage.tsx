import raw from '../../../docs/legal/location-policy.md?raw'
import { LegalDocPage } from './LegalDocPage'

// 위치정보처리방침 — 동선 기록(R6)이 개인위치정보를 다루므로 별도 방침이 필요하다(위치정보법).
export default function LocationPolicyPage() {
  return <LegalDocPage source={raw} title="위치정보처리방침" />
}
