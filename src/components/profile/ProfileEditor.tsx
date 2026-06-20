import { useEffect, useState } from 'react'
import { useMyProfile } from '@/hooks/useMyProfile'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useToast } from '@/hooks/useToast'
import { ColorPicker } from './ColorPicker'
import { defaultColorForRole } from '@/lib/profileColor'
import styles from './ProfileEditor.module.css'

type Props = { coupleId: string | null }

// 내 프로필 편집기(이름·색) — useMyProfile로 시드, 저장은 낙관적 락(expectedVersion=version).
export function ProfileEditor({ coupleId }: Props) {
  const { data: profile, isLoading } = useMyProfile()
  const { updateProfile, isPending, error } = useUpdateProfile(coupleId)
  const toast = useToast()
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(defaultColorForRole('user_a'))

  // 서버 행이 도착/변경되면 폼을 시드(편집 중 충돌은 저장 시 version으로 감지).
  useEffect(() => {
    if (profile) {
      setName(profile.display_name ?? '')
      setColor(profile.color || defaultColorForRole('user_a'))
    }
  }, [profile])

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
      <label className={styles.field}>
        <span className={styles.fieldLabel}>표시 이름</span>
        <input
          className={styles.input}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
          disabled={isPending}
        />
      </label>

      <ColorPicker value={color} onChange={setColor} />

      {error ? (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      ) : null}

      <button className={styles.saveBtn} type="button" onClick={() => void onSave()} disabled={isPending}>
        {isPending ? '저장 중…' : '저장'}
      </button>
    </div>
  )
}
