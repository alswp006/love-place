// JPEG EXIF/GPS 스트립(§7 / security-privacy §3.3 / CLAUDE.md §9) — 발행 시 집·동선 유출 차단.
// 순수 함수(테스트로 못박음). APP1(Exif/XMP) + COM(주석) 세그먼트를 제거. APP0(JFIF)·ICC 등은 보존(렌더 호환).
// 서버(Edge Function)는 Deno라 동일 로직을 복제한다(import 불가).

const M_SOS = 0xda // Start of Scan(이후는 엔트로피 데이터 — 세그먼트 파싱 종료)
const M_EOI = 0xd9
const M_APP1 = 0xe1 // Exif/XMP가 사는 마커(GPS·촬영기기 정보)
const M_COM = 0xfe // 주석

function isJpeg(b: Uint8Array): boolean {
  return b.length >= 2 && b[0] === 0xff && b[1] === 0xd8
}

/** APP1(Exif/XMP)·COM 세그먼트를 제거한 JPEG 바이트. JPEG가 아니면 원본 그대로 반환(호출부가 형식 검사). */
export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (!isJpeg(input)) return input
  const out: number[] = [0xff, 0xd8] // SOI
  let i = 2
  while (i + 1 < input.length) {
    if (input[i] !== 0xff) {
      for (let j = i; j < input.length; j++) out.push(input[j]!)
      return new Uint8Array(out)
    }
    const marker = input[i + 1]!
    if (marker === M_SOS || marker === M_EOI) {
      // SOS/EOI 이후는 그대로 복사(엔트로피 데이터).
      for (let j = i; j < input.length; j++) out.push(input[j]!)
      return new Uint8Array(out)
    }
    if (i + 3 >= input.length) break
    const len = (input[i + 2]! << 8) | input[i + 3]! // 세그먼트 길이(길이 2바이트 포함)
    const segEnd = i + 2 + len
    const drop = marker === M_APP1 || marker === M_COM
    if (!drop) {
      for (let j = i; j < segEnd && j < input.length; j++) out.push(input[j]!)
    }
    i = segEnd
  }
  return new Uint8Array(out)
}

/** EXIF(APP1 + "Exif\0\0") 존재 여부 — 스트립 검증용(가공본에 남으면 테스트 실패). */
export function hasExif(input: Uint8Array): boolean {
  if (!isJpeg(input)) return false
  let i = 2
  while (i + 3 < input.length) {
    if (input[i] !== 0xff) return false
    const marker = input[i + 1]!
    if (marker === M_SOS || marker === M_EOI) return false
    const len = (input[i + 2]! << 8) | input[i + 3]!
    if (marker === M_APP1) {
      // payload 시작 i+4에서 "Exif"(0x45 0x78 0x69 0x66) 확인
      if (input[i + 4] === 0x45 && input[i + 5] === 0x78 && input[i + 6] === 0x69 && input[i + 7] === 0x66) {
        return true
      }
    }
    i += 2 + len
  }
  return false
}
