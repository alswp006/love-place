-- 0022 사진 Storage — 비공개 버킷 + couple 격리
--
-- photos 테이블과 RLS는 0001·0004에 이미 있는데 **버킷이 없었다**. 내보내기 코드(dumpSchema)가
-- storage.from('photos')를 부르고 있었으니, 사진 기능을 붙이는 순간 터졌을 자리다.
--
-- 비공개가 기본값이다(§10.3). 읽기는 서명 URL로만 — 공개 버킷을 쓰면 URL만 알면 누구나
-- 우리 사진을 보게 된다. 블로그 발행(§7)은 EXIF를 벗긴 **가공본을 별도 공개 경로**에
-- 올리는 별도 경로이며, 이 버킷을 그대로 공개하지 않는다.
--
-- 경로 규약: `{couple_id}/{photo_id}.{ext}` — 첫 폴더가 couple_id다.
--   Storage에는 행 단위 RLS가 없으므로 **경로의 첫 세그먼트로 격리**한다.
--   (storage.foldername(name))[1] = 호출자의 couple_id 일 때만 읽고 쓸 수 있다.
--
-- 멱등: on conflict do nothing + DROP POLICY IF EXISTS → 재푸시 무해.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false,
  -- 한 장 12MB 상한. 클라이언트가 이미 리사이즈해 올리므로 이건 사고 방지선이다.
  12582912,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────
-- couple 격리 — 경로 첫 세그먼트가 내 couple_id일 때만.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS photos_bucket_select ON storage.objects;
CREATE POLICY photos_bucket_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = public.current_couple_id()::text
  );

DROP POLICY IF EXISTS photos_bucket_insert ON storage.objects;
CREATE POLICY photos_bucket_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = public.current_couple_id()::text
  );

DROP POLICY IF EXISTS photos_bucket_update ON storage.objects;
CREATE POLICY photos_bucket_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = public.current_couple_id()::text
  )
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = public.current_couple_id()::text
  );

-- 삭제는 soft-delete(photos.deleted_at)가 정본이다(§4.3). 파일 자체를 지우는 것은
-- 복구 유예가 지난 뒤의 정리 잡·관계 종료(§5)에서만 — 그래도 실수 정리를 막지 않게 정책은 둔다.
DROP POLICY IF EXISTS photos_bucket_delete ON storage.objects;
CREATE POLICY photos_bucket_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = public.current_couple_id()::text
  );

-- 장소별 사진 조회 보조(살아있는 것만).
CREATE INDEX IF NOT EXISTS idx_photos_place
  ON public.photos(place_id, created_at DESC) WHERE deleted_at IS NULL;
