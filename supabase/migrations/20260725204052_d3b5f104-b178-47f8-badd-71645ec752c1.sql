
CREATE POLICY "store assets own folder select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'store-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "store assets own folder insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'store-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "store assets own folder update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'store-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "store assets own folder delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'store-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
