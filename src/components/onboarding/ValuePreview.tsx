import styles from './ValuePreview.module.css'

type ValueItem = { icon: string; title: string; desc: string }
// 브랜드뉴(미연결) 사용자에게 둘이 쓰는 가치를 미리 보여주는 정적 블록(spec R3 line 51 value-preview arm).
const ITEMS: ValueItem[] = [
  { icon: '📍', title: '함께 가고싶은 곳', desc: '둘이 고른 장소를 한 지도에 별표로 모아요.' },
  { icon: '🗓️', title: '하나의 캘린더', desc: '내 일정·상대 일정·함께 일정이 한 화면에.' },
  { icon: '📷', title: '같이 남기는 기록', desc: '다녀온 곳과 사진을 둘만의 앨범으로.' },
]

export function ValuePreview() {
  return (
    <section className={styles.wrap} aria-label="둘이 쓰면 가능한 것">
      <h2 className={styles.heading}>둘이 쓰면 이런 게 가능해요</h2>
      <ul className={styles.list}>
        {ITEMS.map((it) => (
          <li key={it.title} className={styles.item}>
            <span className={styles.icon} aria-hidden>{it.icon}</span>
            <div className={styles.text}>
              <span className={styles.itemTitle}>{it.title}</span>
              <span className={styles.itemDesc}>{it.desc}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
