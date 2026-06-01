// CSS Modules 타입 선언(TS strict에서 import 허용).
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}
