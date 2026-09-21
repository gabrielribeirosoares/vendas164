import { supabase } from "@/integrations/supabase/client";
import { optimizeImage, type ImageUploadPreset } from "@/lib/imageOptimization";

const YEAR = 60 * 60 * 24 * 365;
const BUCKET = "store-assets";

export async function uploadImage(
  userId: string,
  file: File,
  preset: ImageUploadPreset = "product",
): Promise<string> {
  const optimized = await optimizeImage(file, preset);
  const assetId = crypto.randomUUID();
  const folder = preset === "product" ? "optimized-products" : "optimized-logos";
  const basePath = `${userId}/${folder}/${assetId}`;
  const mainPath = `${basePath}/main.webp`;
  const thumbnailPath = `${basePath}/thumb.webp`;

  if (optimized.thumbnail) {
    const { error: thumbnailError } = await supabase.storage
      .from(BUCKET)
      .upload(thumbnailPath, optimized.thumbnail, {
        cacheControl: String(YEAR),
        contentType: "image/webp",
        upsert: false,
      });
    if (thumbnailError) throw thumbnailError;
  }

  const { error } = await supabase.storage.from(BUCKET).upload(mainPath, optimized.main, {
    cacheControl: String(YEAR),
    contentType: "image/webp",
    upsert: false,
  });
  if (error) {
    if (optimized.thumbnail) await supabase.storage.from(BUCKET).remove([thumbnailPath]);
    throw error;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(mainPath);
  return data.publicUrl;
}
