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

export function Attachments({ items }: { items: Attachment[] }) {
  const urls = useSignedUrls(items.map((a) => a.path));
  const images = items.filter((a) => a.type.startsWith("image/"));
  const files = items.filter((a) => !a.type.startsWith("image/"));

  return (
    <div className="mt-1.5 space-y-1.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {images.map((image) =>
            urls[image.path] ? (
              <a
                key={image.path}
                href={urls[image.path]}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-md border border-border"
              >
                {/* Signed, short-lived URLs: next/image's optimizer can't cache these. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urls[image.path]}
                  alt={image.name}
                  loading="lazy"
                  className="max-h-64 max-w-full object-contain sm:max-w-sm"
                />
              </a>
            ) : (
              <span
                key={image.path}
                className="block h-40 w-56 animate-pulse rounded-md bg-hover"
                aria-label={`Loading ${image.name}`}
              />
            ),
          )}
        </div>
      )}
      {files.map((file) => (
        <div
          key={file.path}
          className="flex max-w-sm items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
        >
          <FileIcon className="h-7 w-7 shrink-0 text-accent-text" />
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
