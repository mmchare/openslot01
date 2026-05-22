INSERT INTO storage.buckets (id, name, public)
VALUES ('app-icons', 'app-icons', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read app-icons'
  ) THEN
    CREATE POLICY "Public read app-icons"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'app-icons');
  END IF;
END $$;