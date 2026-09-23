export type ImageUploadPreset = "product" | "logo";

export interface OptimizedImageSet {
  main: Blob;
  thumbnail?: Blob;
}

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

const PRESETS = {
  product: {
    main: { maxWidth: 1200, maxHeight: 900, maxBytes: 320 * 1024, quality: 0.82 },
    thumbnail: { maxWidth: 480, maxHeight: 360, maxBytes: 90 * 1024, quality: 0.76 },
  },
  logo: {
    main: { maxWidth: 512, maxHeight: 512, maxBytes: 140 * 1024, quality: 0.86 },
  },
} as const;

type VariantConfig = {
  maxWidth: number;
  maxHeight: number;
  maxBytes: number;
  quality: number;
};

type VariantEncoding = {
  fallbackType: "image/jpeg" | "image/png";
  preferredType?: "image/webp" | "image/jpeg" | "image/png";
  background?: string;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image_decode_failed"));
    };
    image.src = objectUrl;
  });
}

function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/webp" | "image/jpeg" | "image/png",
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      resolve,
      type,
      quality,
    );
  });
}

async function encodeCanvas(
  canvas: HTMLCanvasElement,
  quality: number,
  encoding: VariantEncoding,
): Promise<Blob> {
  if (encoding.preferredType) {
    const preferred = await canvasToBlob(
      canvas,
      encoding.preferredType,
      encoding.preferredType === "image/png" ? undefined : quality,
    );
    if (preferred?.type === encoding.preferredType) return preferred;
    throw new Error("image_encode_failed");
  }

  const webp = await canvasToBlob(canvas, "image/webp", quality);
  if (webp?.type === "image/webp") return webp;

  const fallback = await canvasToBlob(
    canvas,
    encoding.fallbackType,
    encoding.fallbackType === "image/jpeg" ? quality : undefined,
  );
  if (fallback?.type === encoding.fallbackType) return fallback;

  throw new Error("image_encode_failed");
}

async function createVariant(
  image: HTMLImageElement,
  config: VariantConfig,
  encoding: VariantEncoding,
): Promise<Blob> {
  const initial = fitWithin(
    image.naturalWidth,
    image.naturalHeight,
    config.maxWidth,
    config.maxHeight,
  );
  let width = initial.width;
  let height = initial.height;
  let quality = config.quality;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("canvas_unavailable");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (encoding.background) {
      context.fillStyle = encoding.background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);

    const blob = await encodeCanvas(canvas, quality, encoding);
    if (blob.size <= config.maxBytes || (width <= 320 && height <= 320)) return blob;

    if (blob.type !== "image/png" && quality > 0.56) {
      quality = Math.max(0.56, quality - 0.08);
    } else {
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
      quality = config.quality;
    }
  }

  throw new Error("image_optimization_failed");
}

export async function optimizeImage(
  file: File,
  preset: ImageUploadPreset,
): Promise<OptimizedImageSet> {
  if (!file.type.startsWith("image/")) throw new Error("invalid_image_type");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("image_too_large");

  const image = await loadImage(file);
  const config = PRESETS[preset];
  const encoding: VariantEncoding = preset === "logo"
    ? { fallbackType: "image/png" }
    : { fallbackType: "image/jpeg", background: "#ffffff" };
  const main = await createVariant(image, config.main, encoding);

  if (preset === "product") {
    return {
      main,
      thumbnail: await createVariant(image, PRESETS.product.thumbnail, {
        ...encoding,
        preferredType: main.type as VariantEncoding["preferredType"],
      }),
    };
  }

  return { main };
}

export function getImageUploadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (message === "image_too_large") return "A imagem original deve ter no máximo 12 MB.";
  if (message === "invalid_image_type") return "Selecione um arquivo de imagem válido.";
  if (message === "image_decode_failed")
    return "Não foi possível abrir esta imagem. Tente JPG, PNG ou WebP.";
  if (message === "image_encode_failed")
    return "Este navegador não conseguiu preparar a imagem. Tente outra foto ou atualize o navegador.";
  return "Falha ao otimizar e enviar a imagem.";
}
