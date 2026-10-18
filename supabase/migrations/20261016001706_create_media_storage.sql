-- Proposed limits until the client confirms Q10.
do $$
declare
  inquiry_limit_bytes bigint := 10 * 1024 * 1024;
  job_limit_bytes bigint := 50 * 1024 * 1024;
  gallery_limit_bytes bigint := 10 * 1024 * 1024;

  image_types text[] := array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/heic',
    'image/heif'
  ];

  video_types text[] := array[
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ];
begin
  insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
  )
  values
    (
      'inquiry photos',
      'inquiry photos',
      false,
      inquiry_limit_bytes,
      image_types
    ),
    (
      'job media',
      'job media',
      false,
      job_limit_bytes,
      image_types || video_types
    ),
    (
      'gallery',
      'gallery',
      true,
      gallery_limit_bytes,
      image_types
    )
  on conflict (id) do update
  set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
end;
$$;

-- Ordinary clients cannot directly read, list, upload,
-- update, or delete objects in these buckets.
-- The server will issue signed URLs for permitted operations.
create policy "Media access requires server-issued signed URLs"
on storage.objects
as restrictive
for all
to anon, authenticated
using (
  bucket_id not in ('inquiry photos', 'job media', 'gallery')
)
with check (
  bucket_id not in ('inquiry photos', 'job media', 'gallery')
);