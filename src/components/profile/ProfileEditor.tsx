import { useEffect, useState } from 'react'
import { useMyProfile } from '@/hooks/useMyProfile'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useCouple } from '@/hooks/useCouple'
import { useProfiles } from '@/hooks/useProfiles'
import { useToast } from '@/hooks/useToast'
import { ColorPicker } from './ColorPicker'
import { AvatarPicker } from './AvatarPicker'
import { defaultColorForRole } from '@/lib/profileColor'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import styles from './ProfileEditor.module.css'

type Props = { coupleId: string | null }

// 내 프로필 편집기(사진·이름·색) — useMyProfile로 시드, 저장은 낙관적 락(expectedVersion=version).
//
// 사진은 별도 mutation이다(AvatarPicker → useAvatarUpload): Storage 업로드가 얽혀 있어
// 이름·색 저장 버튼과 한 트랜잭션으로 묶으면 "이름 고치다 사진이 날아가는" 경로가 생긴다.
// 대신 둘 다 같은 version을 조건으로 쓰므로, 한쪽이 먼저 저장되면 다른 쪽은 충돌로 잡힌다.
// 색이 비어 있으면 역할 기본색(인비터=user_a=블루, 억셉터=user_b=핑크)으로 시드 →
// 동의 온보딩 단계를 제거해도 두 파트너가 대비되는 기본색을 갖는다(§8 색+라벨).
export function ProfileEditor({ coupleId }: Props) {
  const { data: profile, isLoading } = useMyProfile()
  const { data: couple } = useCouple()
  const { data: profiles } = useProfiles(coupleId)
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

  const me = coupleId ? profiles?.[profile.id] : undefined

  return (
    <div className={styles.editor}>
      {/* 사진이 먼저 — '나'를 가장 크게 바꾸는 항목이고, 이름·색은 그 아래 보조다. */}
      <AvatarPicker
        coupleId={coupleId}
        userId={profile.id}
        currentUrl={me?.avatarUrl ?? null}
        currentPath={profile.avatar_url}
        displayName={name}
        color={color}
        version={profile.version}
      />

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
