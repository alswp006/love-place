// JPEG EXIF에서 촬영 시각·좌표·회전만 뽑는다 — 순수 함수(테스트로 못박음).
//
// 왜 필요한가: 업로드는 캔버스로 재인코딩하므로 EXIF가 **통째로 사라진다**. 스키마에는
// taken_at / exif_lat / exif_lng 자리가 있는데(0001), 리사이즈 뒤에 읽으면 이미 없다.
// 그러니 **원본 File에서 먼저 읽어** insert 페이로드에 실어야 한다. 나중에 복구할 소스가 없다.
//
// 라이브러리를 안 쓴 이유: 필요한 게 세 필드뿐이고, exifr 같은 패키지는 수십 KB에 우리가 안 쓰는
// 수백 개 태그를 끌고 온다. APP1 헤더만 걸어 읽는 건 아래 정도 분량이다.
//
// 범위: JPEG(APP1/TIFF)만. HEIC·PNG·WebP는 구조가 달라 null을 준다 — 그럴 땐 호출부가
// file.lastModified로 폴백한다(없는 값을 지어내지 않는다).

export type PhotoExif = {
  /** 촬영 시각(ISO). EXIF는 tz가 없어 **단말 로컬 시간**으로 해석한다. */
  takenAt: string | null
  lat: number | null
  lng: number | null
  /** EXIF Orientation 1~8. 1(또는 미상)이면 회전 없음. */
  orientation: number
}

const EMPTY: PhotoExif = { takenAt: null, lat: null, lng: null, orientation: 1 }

// TIFF 태그
const T_ORIENTATION = 0x0112
const T_EXIF_IFD = 0x8769
const T_GPS_IFD = 0x8825
const T_DATETIME_ORIGINAL = 0x9003
const T_DATETIME_DIGITIZED = 0x9004
const T_DATETIME = 0x0132
const G_LAT_REF = 0x0001
const G_LAT = 0x0002
const G_LNG_REF = 0x0003
const G_LNG = 0x0004

/** 'YYYY:MM:DD HH:MM:SS' → ISO(로컬 해석). 형식이 아니면 null. */
export function parseExifDate(s: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se))
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

/** 도/분/초 유리수 3쌍 → 십진 도. ref가 S/W면 음수. */
export function dmsToDegrees(dms: readonly number[], ref: string): number | null {
  const [d = 0, m = 0, s = 0] = dms
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s)) return null
  const deg = d + m / 60 + s / 3600
  if (!Number.isFinite(deg) || deg > 180) return null
  return ref === 'S' || ref === 'W' ? -deg : deg
}

type Reader = { u16: (o: number) => number; u32: (o: number) => number; le: boolean }

function makeReader(v: DataView, le: boolean): Reader {
  return { u16: (o) => v.getUint16(o, le), u32: (o) => v.getUint32(o, le), le }
}

/** IFD 하나를 읽어 tag → 값(숫자 배열 또는 문자열)으로. */
function readIfd(
  v: DataView,
  r: Reader,
  tiff: number,
  ifd: number,
): Map<number, number[] | string> {
  const out = new Map<number, number[] | string>()
  if (ifd + 2 > v.byteLength) return out
  const count = r.u16(ifd)
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12
    if (e + 12 > v.byteLength) break
    const tag = r.u16(e)
    const type = r.u16(e + 2)
    const num = r.u32(e + 4)
    const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }
    const unit = sizes[type] ?? 0
    if (!unit) continue
    const bytes = unit * num
    const at = bytes <= 4 ? e + 8 : tiff + r.u32(e + 8)
    if (at < 0 || at + bytes > v.byteLength) continue

    if (type === 2) {
      let s = ''
      for (let k = 0; k < num; k++) {
        const c = v.getUint8(at + k)
        if (c === 0) break
        s += String.fromCharCode(c)
      }
      out.set(tag, s)
      continue
    }
    const vals: number[] = []
    for (let k = 0; k < num; k++) {
      const o = at + k * unit
      if (type === 3) vals.push(r.u16(o))
      else if (type === 4 || type === 9) vals.push(r.u32(o))
      else if (type === 5 || type === 10) {
        const n = r.u32(o)
        const d = r.u32(o + 4)
        vals.push(d === 0 ? 0 : n / d)
      } else vals.push(v.getUint8(o))
    }
    out.set(tag, vals)
  }
  return out
}

/** JPEG 바이트에서 EXIF를 읽는다. EXIF가 없거나 JPEG가 아니면 기본값. */
export function readExif(buf: ArrayBuffer): PhotoExif {
  const v = new DataView(buf)
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return EMPTY // SOI 아님 = JPEG 아님

  // APP1(0xFFE1) 세그먼트에서 'Exif\0\0' 찾기
  let p = 2
  let tiff = -1
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) break
    const marker = v.getUint8(p + 1)
    if (marker === 0xda || marker === 0xd9) break // SOS/EOI — 이후는 압축 데이터
    const len = v.getUint16(p + 2)
    if (len < 2) break
    if (marker === 0xe1 && p + 4 + 6 <= v.byteLength) {
      let sig = ''
      for (let k = 0; k < 4; k++) sig += String.fromCharCode(v.getUint8(p + 4 + k))
      if (sig === 'Exif') {
        tiff = p + 10
        break
      }
    }
    p += 2 + len
  }
  if (tiff < 0 || tiff + 8 > v.byteLength) return EMPTY

  const bom = v.getUint16(tiff)
  if (bom !== 0x4949 && bom !== 0x4d4d) return EMPTY
  const r = makeReader(v, bom === 0x4949)
  if (r.u16(tiff + 2) !== 0x002a) return EMPTY
  const ifd0 = tiff + r.u32(tiff + 4)

  const main = readIfd(v, r, tiff, ifd0)
  const orientationVal = main.get(T_ORIENTATION)
  const orientation =
    Array.isArray(orientationVal) && orientationVal[0] && orientationVal[0] >= 1 && orientationVal[0] <= 8
      ? orientationVal[0]
      : 1

  // 촬영 시각: EXIF IFD의 DateTimeOriginal > DateTimeDigitized > IFD0의 DateTime
  let takenAt: string | null = null
  const exifPtr = main.get(T_EXIF_IFD)
  if (Array.isArray(exifPtr) && exifPtr[0]) {
    const sub = readIfd(v, r, tiff, tiff + exifPtr[0])
    for (const tag of [T_DATETIME_ORIGINAL, T_DATETIME_DIGITIZED]) {
      const raw = sub.get(tag)
      if (typeof raw === 'string' && !takenAt) takenAt = parseExifDate(raw)
    }
  }
  if (!takenAt) {
    const raw = main.get(T_DATETIME)
    if (typeof raw === 'string') takenAt = parseExifDate(raw)
  }

  // 좌표
  let lat: number | null = null
  let lng: number | null = null
  const gpsPtr = main.get(T_GPS_IFD)
  if (Array.isArray(gpsPtr) && gpsPtr[0]) {
    const g = readIfd(v, r, tiff, tiff + gpsPtr[0])
    const latRef = g.get(G_LAT_REF)
    const latVal = g.get(G_LAT)
    const lngRef = g.get(G_LNG_REF)
    const lngVal = g.get(G_LNG)
    if (Array.isArray(latVal) && typeof latRef === 'string') lat = dmsToDegrees(latVal, latRef)
    if (Array.isArray(lngVal) && typeof lngRef === 'string') lng = dmsToDegrees(lngVal, lngRef)
    // 위도 범위를 벗어나면 잘못 읽은 것 — 지어내지 않는다.
    if (lat != null && Math.abs(lat) > 90) lat = null
  }

  return { takenAt, lat, lng, orientation }
}

/** File → EXIF. 앞부분만 읽는다(APP1은 파일 머리에 있고, 전체를 읽으면 큰 사진에서 낭비). */
export async function readExifFromFile(file: File): Promise<PhotoExif> {
  try {
    const head = await file.slice(0, 256 * 1024).arrayBuffer()
    return readExif(head)
  } catch {
    return EMPTY
  }
}
