import { mp4FrameRate } from "./mp4";
import type { AnalysisError, VideoMetadata } from "./types";

export const VIDEO_LIMITS = {
  maxFileBytes: 1024 * 1024 * 1024,
  maxDurationSeconds: 300,
  recommendedMaxDurationSeconds: 75,
  minDurationSeconds: 2,
  maxPixels: 3840 * 2160,
};

export const ACCEPTED_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/ogg", "video/x-matroska"];
export const ACCEPT_ATTR = ".mp4,.m4v,.webm,.mov,.ogv,.mkv,video/mp4,video/webm,video/quicktime";

export class VideoValidationError extends Error {
  constructor(public detail: AnalysisError) {
    super(detail.message);
  }
}

export function waitForEvent(target: HTMLMediaElement, event: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(target.error?.message || "Media error"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, onOk);
      target.removeEventListener("error", onErr);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener("error", onErr, { once: true });
  });
}

export async function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) return;
  const p = waitForEvent(video, "seeked", 20000);
  video.currentTime = t;
  await p;
}

async function estimateFrameRate(video: HTMLVideoElement): Promise<number | undefined> {
  const v = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void) => number;
  };
  if (!v.requestVideoFrameCallback) return undefined;
  const times: number[] = [];
  video.muted = true;
  try {
    await video.play();
  } catch {
    return undefined;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 1500);
    const cb = (_now: number, meta: { mediaTime: number }) => {
      times.push(meta.mediaTime);
      if (times.length >= 12) {
        clearTimeout(timer);
        resolve();
      } else v.requestVideoFrameCallback!(cb);
    };
    v.requestVideoFrameCallback!(cb);
  });
  video.pause();
  const diffs = times
    .slice(1)
    .map((t, i) => t - times[i])
    .filter((d) => d > 0.001)
    .sort((a, b) => a - b);
  if (diffs.length < 3) return undefined;
  const fps = 1 / diffs[Math.floor(diffs.length / 2)];
  const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
  const snap = common.find((c) => Math.abs(c - fps) / c < 0.06);
  return snap ?? Math.round(fps * 10) / 10;
}

/**
 * Read metadata and validate a local video without uploading it. Returns
 * metadata and a small thumbnail data URL.
 */
export async function inspectVideo(file: File): Promise<{ meta: VideoMetadata; thumbnail?: string; warnings: string[] }> {
  const warnings: string[] = [];
  const looksLikeVideo = file.type.startsWith("video/") || /\.(mp4|m4v|webm|mov|ogv|mkv)$/i.test(file.name);
  if (!looksLikeVideo) {
    throw new VideoValidationError({
      code: "unsupported_type",
      message: "This file does not look like a video.",
      recoverable: true,
      suggestedAction: "Choose an MP4 (H.264) or WebM soccer clip.",
    });
  }
  if (file.size > VIDEO_LIMITS.maxFileBytes) {
    throw new VideoValidationError({
      code: "file_too_large",
      message: "The file is larger than 1 GB.",
      recoverable: true,
      suggestedAction: "Trim the clip to 30–60 seconds or export at 720p.",
    });
  }
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    try {
      await waitForEvent(video, "loadedmetadata", 15000);
    } catch {
      throw new VideoValidationError({
        code: "unreadable",
        message: "Your browser could not read this video (unsupported codec or damaged file).",
        recoverable: true,
        suggestedAction: "Convert the clip to MP4 (H.264) and try again, or use a Chromium-based browser.",
      });
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new VideoValidationError({
        code: "no_video_track",
        message: "No readable video track or duration was found.",
        recoverable: true,
        suggestedAction: "Re-export the clip as MP4 (H.264) with a standard frame rate.",
      });
    }
    if (duration < VIDEO_LIMITS.minDurationSeconds) {
      throw new VideoValidationError({
        code: "too_short",
        message: "The clip is shorter than 2 seconds.",
        recoverable: true,
        suggestedAction: "Choose a clip of roughly 30–60 seconds.",
      });
    }
    if (duration > VIDEO_LIMITS.maxDurationSeconds) {
      throw new VideoValidationError({
        code: "too_long",
        message: `The clip is ${Math.round(duration)} s long; the maximum is ${VIDEO_LIMITS.maxDurationSeconds} s for in-browser analysis.`,
        recoverable: true,
        suggestedAction: "Trim the clip to 30–60 seconds.",
      });
    }
    if (video.videoWidth * video.videoHeight > VIDEO_LIMITS.maxPixels) {
      throw new VideoValidationError({
        code: "resolution_too_high",
        message: "Resolutions above 4K are not supported.",
        recoverable: true,
        suggestedAction: "Export the clip at 720p or 1080p.",
      });
    }
    if (duration > VIDEO_LIMITS.recommendedMaxDurationSeconds)
      warnings.push("Clips longer than about a minute take noticeably longer to analyze in the browser.");
    if (video.videoHeight > 1080) warnings.push("High-resolution footage is downscaled for analysis; 720p is recommended.");

    // Decode check + thumbnail
    let thumbnail: string | undefined;
    try {
      await seekTo(video, Math.min(1, duration / 3));
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = Math.round((320 * video.videoHeight) / video.videoWidth);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(video, 0, 0, c.width, c.height);
      thumbnail = c.toDataURL("image/jpeg", 0.75);
    } catch {
      throw new VideoValidationError({
        code: "decode_failed",
        message: "The video metadata loaded but frames could not be decoded.",
        recoverable: true,
        suggestedAction: "Convert the clip to MP4 (H.264) and try again.",
      });
    }
    let frameRate: number | undefined;
    try {
      frameRate = await mp4FrameRate(file);
    } catch {
      frameRate = undefined;
    }
    if (!frameRate) {
      try {
        await seekTo(video, 0);
        frameRate = await estimateFrameRate(video);
      } catch {
        frameRate = undefined;
      }
    }    return {
      meta: {
        fileName: file.name,
        mimeType: file.type || "video/unknown",
        durationSeconds: duration,
        width: video.videoWidth,
        height: video.videoHeight,
        frameRate,
        fileSizeBytes: file.size,
      },
      thumbnail,
      warnings,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Lightweight thumbnail from a local video file. Returns undefined on failure. */
export async function createVideoThumbnail(file: File, seekSeconds = 0.5): Promise<string | undefined> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await waitForEvent(video, "loadedmetadata", 10000);
    if (!video.videoWidth || !Number.isFinite(video.duration)) return undefined;
    await seekTo(video, Math.min(seekSeconds, video.duration * 0.25));
    const c = document.createElement("canvas");
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    c.width = Math.round(video.videoWidth * scale);
    c.height = Math.round(video.videoHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } catch {
    return undefined;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
