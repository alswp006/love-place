import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { useAuth } from '@/state/auth'
import { useSignOut } from '@/hooks/useSignOut'
import { tabByPath } from '@/app/tabs'

// 💑 우리 — 설정·연결·내보내기(설계서 §3, §10). P0b/P0d 초대·연결, P0g 내보내기로 확장.
export default function UsPage() {
  const tab = tabByPath('/us')
  const { user } = useAuth()
  const signOut = useSignOut()

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <EmptyState
        emoji={tab.empty.emoji}
        title={tab.empty.title}
        hint={tab.empty.hint}
        action={
          user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--c-text-weak)' }}>
                {user.email} 로 로그인됨
              </span>
              <button type="button" onClick={() => void signOut()}>
                로그아웃
              </button>
            </div>
          ) : null
        }
      />
    </ScreenScaffold>
  )
}
