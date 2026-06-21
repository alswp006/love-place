import type { HTMLAttributes } from 'react'
import styles from './AvatarPair.module.css'

// AvatarPair 시그니처 프리미티브(마시멜로 R2) — 겹친 2인 아바타 + caption 슬롯.
// SourceAvatar(단일 출처 아바타) 위에 빌드: "둘이 함께" 출처를 한 묶음으로 보여주는 시그니처 표현(ux §2 출처 아바타).
// people 길이 2를 기대하되 1이면 단일 아바타로 폴백. 두 번째 아바타는 margin-left:-8px(overlap)로 겹친다.
// 아바타페어 4색(핑크/옐로/민트/라벤더) 소프트 표면 + 각 ink 텍스트. color prop 없으면 index로 순환.
// 색만으로 사람을 구분하지 않는다(§a11y): 각 아바타에 이니셜/이미지 + aria-label(이름) 병기, 컨테이너는 role="group" + 라벨.

// 아바타페어 4색 — color prop 미지정 시 index로 순환(클래스로 이중화).
const PAIR_COLORS = ['pink', 'yellow', 'mint', 'lavender'] as const
export type AvatarColor = (typeof PAIR_COLORS)[number]

// CSS module 클래스는 vite/client 타입상 string|undefined(noUncheckedIndexedAccess) — falsy 필터로 합친다.
const colorClass: Record<AvatarColor, string | undefined> = {
  pink: styles.pink,
  yellow: styles.yellow,
  mint: styles.mint,
  lavender: styles.lavender,
}

export type AvatarPerson = {
  // 접근성 라벨 + 이니셜 폴백의 출처가 되는 이름.
  name?: string
  // 표시 이니셜(미지정 시 name 첫 글자). 둘 다 없으면 '?'.
  initial?: string
  // 프로필 이미지(있으면 이니셜 대신 표시). null/undefined면 이니셜.
  avatarUrl?: string | null
  // 아바타페어 4색 중 하나(미지정 시 index로 순환).
  color?: AvatarColor
}

export type AvatarPairProps = {
  // 사람 배열. 길이 2를 기대하되 1이면 단일 아바타로 폴백(빈 배열이면 아무것도 렌더 안 함).
  people: AvatarPerson[]
  // 출처 설명 슬롯(예: "둘 다 저장함"). 없으면 caption 노드 미렌더.
  caption?: string
  className?: string
  // 그 외 표준 div 속성. role/aria-label은 기본값을 두되 호출부가 덮어쓸 수 있다.
} & Omit<HTMLAttributes<HTMLDivElement>, 'className'>

function avatarLabel(person: AvatarPerson, index: number): string {
  return person.name?.trim() || `사람 ${index + 1}`
}

function avatarInitial(person: AvatarPerson): string {
  if (person.initial?.trim()) return person.initial.trim().slice(0, 1)
  const fromName = person.name?.trim().slice(0, 1)
  return fromName || '?'
}

function avatarClasses(person: AvatarPerson, index: number, isOverlap: boolean): string {
  const color = person.color ?? PAIR_COLORS[index % PAIR_COLORS.length]
  return [styles.avatar, color ? colorClass[color] : undefined, isOverlap ? styles.overlap : undefined]
    .filter(Boolean)
    .join(' ')
}

function rootClasses(className?: string): string {
  return [styles.root, className].filter(Boolean).join(' ')
}

export function AvatarPair({ people, caption, className, ...rest }: AvatarPairProps) {
  // 그룹 라벨: caption 우선, 없으면 이름들을 합쳐 "민제 · 여친" 식으로(색만 의존 금지 — 컨테이너도 텍스트 라벨).
  const names = people.map((p, i) => avatarLabel(p, i))
  const groupLabel = caption?.trim() || names.join(' · ')
  return (
    <div
      role="group"
      aria-label={groupLabel || undefined}
      {...rest}
      className={rootClasses(className)}
    >
      <span className={styles.stack}>
        {people.map((person, index) => {
          const label = avatarLabel(person, index)
          const isOverlap = index > 0
          return (
            <span
              // 이름이 같은 두 사람도 안정적으로 구분되도록 index 포함 키.
              key={`${label}-${index}`}
              className={avatarClasses(person, index, isOverlap)}
              aria-label={label}
              title={label}
            >
              {person.avatarUrl ? (
                <img src={person.avatarUrl} alt="" className={styles.img} />
              ) : (
                avatarInitial(person)
              )}
            </span>
          )
        })}
      </span>
      {caption ? <span className={styles.caption}>{caption}</span> : null}
    </div>
  )
}
