import raw from '../../../docs/legal/privacy-policy.md?raw'
import { LegalDocPage } from './LegalDocPage'

// 개인정보처리방침 — App Store Connect의 '개인정보처리방침 URL'이 여기를 가리킨다.
export default function PrivacyPolicyPage() {
  return <LegalDocPage source={raw} title="개인정보처리방침" />
}
