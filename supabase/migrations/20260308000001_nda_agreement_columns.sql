-- NDA Agreement columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nda_accepted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS nda_signer_name    text,
  ADD COLUMN IF NOT EXISTS nda_signer_address text,
  ADD COLUMN IF NOT EXISTS nda_ip             text,
  ADD COLUMN IF NOT EXISTS nda_user_agent     text;

-- Storage bucket for signed agreement PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('agreements', 'agreements', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users upload own agreement
CREATE POLICY "Users upload own agreement" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'agreements' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS: Admins read any agreement
CREATE POLICY "Admins read agreements" ON storage.objects FOR SELECT
  USING (bucket_id = 'agreements' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- RLS: Users read own agreement
CREATE POLICY "Users read own agreement" ON storage.objects FOR SELECT
  USING (bucket_id = 'agreements' AND auth.uid()::text = (storage.foldername(name))[1]);
