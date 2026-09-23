import { supabase } from "@/integrations/supabase/client";
import { optimizeImage, type ImageUploadPreset } from "@/lib/imageOptimization";

const YEAR = 60 * 60 * 24 * 365;
const BUCKET = "store-assets";

function imageExtension(blob: Blob): "webp" | "jpg" | "png" {
  if (blob.type === "image/jpeg") return "jpg";
  if (blob.type === "image/png") return "png";
  return "webp";
}

export async function uploadImage(
  userId: string,
  file: File,
  preset: ImageUploadPreset = "product",
): Promise<string> {
  const optimized = await optimizeImage(file, preset);
  const assetId = crypto.randomUUID();
  const folder = preset === "product" ? "optimized-products" : "optimized-logos";
  const basePath = `${userId}/${folder}/${assetId}`;
  const mainPath = `${basePath}/main.${imageExtension(optimized.main)}`;
  const thumbnailPath = optimized.thumbnail
    ? `${basePath}/thumb.${imageExtension(optimized.thumbnail)}`
    : null;

  if (optimized.thumbnail && thumbnailPath) {
    const { error: thumbnailError } = await supabase.storage
      .from(BUCKET)
      .upload(thumbnailPath, optimized.thumbnail, {
        cacheControl: String(YEAR),
        contentType: optimized.thumbnail.type,
        upsert: false,
      });
    if (thumbnailError) throw thumbnailError;
  }

  const { error } = await supabase.storage.from(BUCKET).upload(mainPath, optimized.main, {
    cacheControl: String(YEAR),
    contentType: optimized.main.type,
    upsert: false,
  });
  if (error) {
    if (thumbnailPath) await supabase.storage.from(BUCKET).remove([thumbnailPath]);
    throw error;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(mainPath);
  return data.publicUrl;
}
