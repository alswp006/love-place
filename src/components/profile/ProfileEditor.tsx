import { useEffect, useState } from 'react'
import { useMyProfile } from '@/hooks/useMyProfile'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useCouple } from '@/hooks/useCouple'
import { useToast } from '@/hooks/useToast'
import { ColorPicker } from './ColorPicker'
import { defaultColorForRole } from '@/lib/profileColor'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import styles from './ProfileEditor.module.css'

type Props = { coupleId: string | null }

// 내 프로필 편집기(이름·색) — useMyProfile로 시드, 저장은 낙관적 락(expectedVersion=version).
// 색이 비어 있으면 역할 기본색(인비터=user_a=블루, 억셉터=user_b=핑크)으로 시드 →
// 동의 온보딩 단계를 제거해도 두 파트너가 대비되는 기본색을 갖는다(§8 색+라벨).
export function ProfileEditor({ coupleId }: Props) {
  const { data: profile, isLoading } = useMyProfile()
  const { data: couple } = useCouple()
  const myRole = couple?.myRole ?? 'user_a'
  const { updateProfile, isPending, error } = useUpdateProfile(coupleId)
  const toast = useToast()
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(defaultColorForRole(myRole))

  // 서버 행이 도착/변경되면 폼을 시드(편집 중 충돌은 저장 시 version으로 감지).
  useEffect(() => {
    if (profile) {
      setName(profile.display_name ?? '')
      setColor(profile.color || defaultColorForRole(myRole))
    }
  }, [profile, myRole])

  if (isLoading || !profile) {
    return (
      <div className={styles.editor} aria-busy="true">
        <div className={styles.skeletonLine} />
        <div className={styles.skeletonGrid} />
      </div>
    )
  }

  const onSave = async () => {
    try {
      await updateProfile({ display_name: name, color, expectedVersion: profile.version })
      toast.show('프로필을 저장했어요')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장에 실패했어요.')
    }
  }

  return (
    <div className={styles.editor}>
      <Field
        label="표시 이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="이름"
        disabled={isPending}
      />

      <ColorPicker value={color} onChange={setColor} />

      {error ? (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      ) : null}

      <Button variant="primary" onClick={() => void onSave()} disabled={isPending}>
        {isPending ? '저장 중…' : '저장'}
      </Button>
    </div>
  )
}
