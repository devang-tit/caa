/**
 * Shrinks photos before upload: phone cameras produce 3–8 MB images, which
 * are slow to send on mobile data and to load for the other person. Big
 * photos are resized to fit MAX_EDGE and re-encoded (WebP where the browser
 * can, JPEG otherwise), usually around 10× smaller. Re-encoding also drops
 * metadata such as the photo's GPS location.
 *
 * Anything that can't or shouldn't be re-encoded (GIF animations, SVG, small
 * images, browsers without canvas support) is returned unchanged.
 */

const MAX_EDGE = 2048;
const QUALITY = 0.82;
const SKIP_BELOW_BYTES = 300 * 1024;
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export type PreparedFile = { file: File; width?: number; height?: number };

export async function prepareImage(file: File): Promise<PreparedFile> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return { file };
  }

  let bitmap: ImageBitmap;
  try {
    // Applies the photo's EXIF rotation, so portrait shots stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { file }; // a format this browser can't decode
  }

  const { width, height } = bitmap;
  try {
    if (!RESIZABLE.has(file.type) || (file.size < SKIP_BELOW_BYTES && Math.max(width, height) <= MAX_EDGE)) {
      return { file, width, height };
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const blob = await encode(bitmap, w, h);
    if (!blob || blob.size >= file.size) return { file, width, height };

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.${ext}`;
    return { file: new File([blob], name, { type: blob.type, lastModified: file.lastModified }), width: w, height: h };
  } catch {
    return { file, width, height };
  } finally {
    bitmap.close();
  }
}

async function encode(bitmap: ImageBitmap, w: number, h: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  // Browsers that can't encode WebP hand back a PNG instead; use JPEG then,
  // with white behind any transparent areas (JPEG would turn them black).
  const webp = await toBlob("image/webp");
  if (webp?.type === "image/webp") return webp;
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  return toBlob("image/jpeg");
}
