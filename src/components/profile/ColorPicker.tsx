import { PROFILE_PALETTE } from '@/lib/profileColor'
import styles from './ProfileEditor.module.css'

type Props = {
  value: string
  onChange: (hex: string) => void
}

// 사람 색 선택 — role=radiogroup + 각 스와치 role=radio + aria-label(색 이름) 이중화(§8).
export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className={styles.swatches} role="radiogroup" aria-label="내 색">
      {PROFILE_PALETTE.map((entry) => {
        const selected = entry.hex === value
        return (
          <button
            key={entry.hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-pressed={selected}
            aria-label={entry.label}
            className={selected ? `${styles.swatch} ${styles.swatchOn}` : styles.swatch}
            style={{ background: entry.hex }}
            onClick={() => onChange(entry.hex)}
          />
        )
      })}
    </div>
  )
}
