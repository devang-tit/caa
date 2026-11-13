"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, FileIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import type { Attachment } from "@/lib/types";

const BUCKET = "attachments";
const URL_TTL_S = 60 * 60;

// Signed URLs are private to whoever can read the conversation; cache them
// for their lifetime so scrolling and re-renders don't re-sign.
const signed = new Map<string, { url: string; expires: number }>();

function fromCache(paths: string[]) {
  const out: Record<string, string> = {};
  for (const path of paths) {
    const hit = signed.get(path);
    if (hit && hit.expires > Date.now()) out[path] = hit.url;
  }
  return out;
}

function useSignedUrls(paths: string[]) {
  const key = paths.join("\n");
  const [urls, setUrls] = useState(() => fromCache(paths));

  useEffect(() => {
    const list = key ? key.split("\n") : [];
    const missing = list.filter((p) => (signed.get(p)?.expires ?? 0) < Date.now() + 60_000);
    if (missing.length === 0) return;

    let cancelled = false;
    void createClient()
      .storage.from(BUCKET)
      .createSignedUrls(missing, URL_TTL_S)
      .then(({ data }) => {
        const expires = Date.now() + URL_TTL_S * 1000;
        for (const item of data ?? []) {
          if (item.path && item.signedUrl) signed.set(item.path, { url: item.signedUrl, expires });
        }
        if (!cancelled) setUrls(fromCache(list));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function download(item: Attachment) {
  const { data } = await createClient()
    .storage.from(BUCKET)
    .createSignedUrl(item.path, 60, { download: item.name });
  if (data?.signedUrl) window.location.assign(data.signedUrl);
}

const MAX_IMAGE_HEIGHT_PX = 300;
const MAX_IMAGE_WIDTH_PX = 320;

/**
 * Size for an image whose dimensions are known: at most 320px wide and 300px
 * tall (and never wider than the bubble), so the space is reserved before it
 * loads and the chat doesn't jump. A fixed width with max-width (rather than
 * a percentage) also lets the bubble shrink to the image. Older uploads have
 * no dimensions and size themselves when they load.
 */
function imageBox(image: Attachment) {
  if (!image.width || !image.height) return undefined;
  const ratio = image.width / image.height;
  const width = Math.min(image.width, MAX_IMAGE_WIDTH_PX, Math.round(MAX_IMAGE_HEIGHT_PX * ratio));
  return { aspectRatio: `${image.width} / ${image.height}`, width: `${width}px`, maxWidth: "100%" };
}

export function Attachments({ items }: { items: Attachment[] }) {
  const urls = useSignedUrls(items.map((a) => a.path));
  const images = items.filter((a) => a.type.startsWith("image/"));
  const files = items.filter((a) => !a.type.startsWith("image/"));

  return (
    <div className="space-y-1.5 [&:not(:first-child)]:mt-1.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {images.map((image) => {
            const box = imageBox(image);
            return urls[image.path] ? (
              <a
                key={image.path}
                href={urls[image.path]}
                target="_blank"
                rel="noopener noreferrer"
                style={box}
                className="block max-w-full overflow-hidden rounded-[14px] bg-black/5"
              >
                {/* Signed, short-lived URLs: next/image's optimizer can't cache these. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urls[image.path]}
                  alt={image.name}
                  width={image.width}
                  height={image.height}
                  loading="lazy"
                  decoding="async"
                  className={
                    box
                      ? "block h-full w-full object-cover"
                      : "max-h-72 max-w-full object-contain sm:max-w-xs"
                  }
                />
              </a>
            ) : (
              <span
                key={image.path}
                style={box}
                className={`block animate-pulse rounded-[14px] bg-black/10 dark:bg-white/10 ${box ? "max-w-full" : "h-40 w-56 max-w-full"}`}
                aria-label={`Loading ${image.name}`}
              />
            );
          })}
        </div>
      )}
      {files.map((file) => (
        <div
          key={file.path}
          className="flex w-72 max-w-full items-center gap-3 rounded-xl bg-black/[0.04] px-2.5 py-2 dark:bg-white/[0.06]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => download(file)}
            aria-label={`Download ${file.name}`}
            title="Download"
            className="icon-btn"
          >
            <DownloadIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
