import {
  useId,
  type ChangeEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import styles from './Field.module.css'

// 공용 Field 프리미티브(마시멜로 R2) — input/textarea 래퍼.
// label(htmlFor/id 연결) + error 텍스트(role="alert" + aria-invalid/aria-describedby)로
// 색만이 아닌 텍스트/aria로 의미를 이중화한다(§a11y 색만 의존 금지).
// id는 명시값 우선, 없으면 useId 폴백(라벨/에러 연결이 항상 성립).
export type FieldAs = 'input' | 'textarea'

// input/textarea 양형에서 충돌하거나 자체 관리하는 prop은 표준 속성에서 제외하고 다시 정의한다.
type NativeOmit = 'className' | 'id' | 'value' | 'onChange' | 'children'

type CommonProps = {
  // 폼 라벨(선택). 있으면 <label htmlFor>로 control과 연결.
  label?: string
  // 에러 텍스트(선택). 있으면 role="alert"로 노출 + control에 aria-invalid/aria-describedby.
  error?: string
  // control id(선택). 미지정 시 useId 폴백.
  id?: string
  // 제어 컴포넌트 — value/onChange 필수.
  value: string
  className?: string
}

// as='input'(기본): 네이티브 input 속성 전달.
type FieldAsInput = CommonProps & {
  as?: 'input'
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, NativeOmit | 'onChange'>

// as='textarea': 네이티브 textarea 속성 전달(type 없음).
type FieldAsTextarea = CommonProps & {
  as: 'textarea'
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, NativeOmit | 'onChange'>

export type FieldProps = FieldAsInput | FieldAsTextarea

function classes(...names: Array<string | undefined>): string {
  return names.filter(Boolean).join(' ')
}

export function Field(props: FieldProps) {
  const autoId = useId()
  const id = props.id ?? autoId
  const errorId = `${id}-error`
  const hasError = Boolean(props.error)

  // 공통 aria/속성 — control에 항상 적용.
  const controlClass = classes(styles.control)
  const ariaInvalid = hasError ? true : undefined
  const ariaDescribedBy = hasError ? errorId : undefined

  const label =
    props.label !== undefined ? (
      <label htmlFor={id} className={styles.label}>
        {props.label}
      </label>
    ) : null

  const errorNode = props.error ? (
    <span id={errorId} role="alert" className={styles.error}>
      {props.error}
    </span>
  ) : null

  if (props.as === 'textarea') {
    const {
      as: _as,
      label: _label,
      error: _error,
      id: _id,
      value,
      onChange,
      className,
      ...rest
    } = props
    return (
      <div className={classes(styles.wrapper, className)}>
        {label}
        <textarea
          {...rest}
          id={id}
          value={value}
          onChange={onChange}
          className={controlClass}
          data-as="textarea"
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
        />
        {errorNode}
      </div>
    )
  }

  const {
    as: _as,
    label: _label,
    error: _error,
    id: _id,
    value,
    onChange,
    className,
    type,
    ...rest
  } = props
  return (
    <div className={classes(styles.wrapper, className)}>
      {label}
      <input
        {...rest}
        id={id}
        type={type ?? 'text'}
        value={value}
        onChange={onChange}
        className={controlClass}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      />
      {errorNode}
    </div>
  )
}
