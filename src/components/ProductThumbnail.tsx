import type { ImgHTMLAttributes } from "react";
import { getProductCardImageUrl } from "@/lib/imageUrls";

type ProductThumbnailProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

export function ProductThumbnail({ src, alt, ...props }: ProductThumbnailProps) {
  return (
    <img src={getProductCardImageUrl(src)} alt={alt} loading="lazy" decoding="async" {...props} />
  );
}
