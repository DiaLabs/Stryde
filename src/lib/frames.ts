"use client";

import { createFile, DataStream, Endianness, MP4BoxBuffer, type Movie, type Sample } from "mp4box";
import { seekTo } from "./video";

/**
 * Where the analysis gets its sampled frames from.
 *
 * Seeking a <video> to every sampled time is slow: each seek makes the browser decode again from
 * the previous keyframe, so the cost grows with the distance to it (120 ms on average and up to
 * 470 ms per frame measured on the 480p sample clip; seconds on 1080p footage). The WebCodecs
 * reader instead decodes the file once, front to back, on the hardware video decoder and hands
 * over the frames at the sampled times as they come out. Seeking stays as the fallback for files
 * WebCodecs can't read (WebM, unusual codecs, rotated phone video).
 */
export interface FrameReader {
  readonly kind: "webcodecs" | "seek";
  /** The frame shown at times[i]. Ask in increasing order; call rewind() to go back. */
  frame(i: number): Promise<ImageBitmap>;
  /** Start again from times[i] (after a worker restart, the frames in flight are re-run). */
  rewind(i: number): void;
  /** Set when the reader can't go on; the caller switches to the seek reader. */
  readonly broken: Error | null;
  close(): void;
}

// ------------------------------------------------------------------ seek reader (fallback)

export function seekReader(video: HTMLVideoElement, times: number[]): FrameReader {
  return {
    kind: "seek",
    broken: null,
    async frame(i: number) {
      await seekTo(video, times[i]);
      return createImageBitmap(video);
    },
    rewind() {},
    close() {},
  };
}

// ------------------------------------------------------------------ WebCodecs reader

interface SampleInfo {
  /** presentation time in microseconds, first frame at 0 */
  ts: number;
  dur: number;
  offset: number;
  size: number;
  key: boolean;
}

/** bitmaps decoded ahead of the consumer; the decoder pauses when this many are waiting */
const MAX_READY = 4;
/** encoded chunks queued in the decoder before feeding pauses */
const MAX_DECODE_QUEUE = 8;
/** one file read covers this many bytes of samples at most */
const READ_SPAN = 4 << 20;

async function readMovie(file: File): Promise<{ info: Movie; mp4: ReturnType<typeof createFile> } | null> {
  const mp4 = createFile(false);
  let info: Movie | null = null;
  let failed = false;
  mp4.onReady = (i) => (info = i);
  mp4.onError = () => (failed = true);
  // mp4box asks for the next byte it needs, so a moov box at the end of a large file is reached
  // without reading the media data in between
  let pos = 0;
  const CHUNK = 1 << 20;
  for (let steps = 0; !info && !failed && pos < file.size && steps < 4096; steps++) {
    const ab = await file.slice(pos, Math.min(file.size, pos + CHUNK)).arrayBuffer();
    const next = mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(ab, pos), pos + CHUNK >= file.size);
    pos = next > pos ? next : pos + ab.byteLength;
  }
  return info && !failed ? { info, mp4 } : null;
}

/**
 * Open a WebCodecs reader for `times` (seconds), or explain why this file or browser can't use
 * one (the caller then seeks a <video> instead).
 */
export async function openWebCodecsReader(file: File, times: number[]): Promise<FrameReader | { unavailable: string }> {
  const no = (unavailable: string) => ({ unavailable });
  if (typeof VideoDecoder === "undefined" || typeof EncodedVideoChunk === "undefined") return no("this browser has no WebCodecs video decoder");
  if (!/\.(mp4|m4v|mov)$/i.test(file.name) && !/mp4|quicktime/.test(file.type)) return no("only MP4 and MOV files are decoded directly");
  try {
    const parsed = await readMovie(file);
    if (!parsed) return no("the MP4 structure could not be read");
    const track = parsed.info.videoTracks[0];
    if (!track) return no("no video track");
    const trak = parsed.mp4.getTrackById(track.id);
    // a rotated (phone) video: the <video> element applies the rotation, decoded frames don't
    const m = trak.tkhd?.matrix;
    if (m && (m[1] !== 0 || m[3] !== 0 || m[0] <= 0 || m[4] <= 0)) return no("the video is rotated");
    const entry = trak.mdia.minf.stbl.stsd.entries[0] as unknown as Record<string, { write(s: DataStream): void } | undefined>;
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    let description: Uint8Array | undefined;
    if (box) {
      const ds = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
      box.write(ds);
      description = new Uint8Array(ds.buffer, 8); // without the box header
    }
    const config: VideoDecoderConfig = {
      codec: track.codec,
      codedWidth: track.video?.width ?? track.track_width,
      codedHeight: track.video?.height ?? track.track_height,
      description,
      hardwareAcceleration: "prefer-hardware",
      optimizeForLatency: false,
    };
    let support = await VideoDecoder.isConfigSupported(config).catch(() => null);
    if (!support?.supported) {
      // no hardware decoder for this codec (common on Linux): the software one is still far
      // faster than seeking
      delete config.hardwareAcceleration;
      support = await VideoDecoder.isConfigSupported(config).catch(() => null);
    }
    if (!support?.supported) return no(`this browser can't decode ${track.codec}`);
    const raw: Sample[] = trak.samples ?? [];
    if (!raw.length) return no("the video track has no samples");
    const scale = track.timescale;
    const minCts = raw.reduce((mn, s) => Math.min(mn, s.cts), Infinity);
    const samples: SampleInfo[] = raw.map((s) => ({
      ts: Math.round(((s.cts - minCts) * 1e6) / scale),
      dur: Math.max(1, Math.round((s.duration * 1e6) / scale)),
      offset: s.offset,
      size: s.size,
      key: s.is_sync,
    }));
    if (!samples[0].key) return no("the video doesn't start with a keyframe");
    return new WebCodecsReader(file, samples, config, times);
  } catch (e) {
    return no(`the decoder could not be set up (${String((e as Error)?.message ?? e).slice(0, 80)})`);
  }
}

type Waiter = { resolve: (b: ImageBitmap) => void; reject: (e: Error) => void };

class WebCodecsReader implements FrameReader {
  readonly kind = "webcodecs" as const;
  broken: Error | null = null;
  private decoder: VideoDecoder;
  /** next sample (decode order) to feed */
  private next = 0;
  /** next sampled time to fill */
  private target = 0;
  private ready = new Map<number, Promise<ImageBitmap>>();
  private waiters = new Map<number, Waiter>();
  private feeding = false;
  private flushed = false;
  private finished = false;
  /** bumped on rewind; work started for an older generation is dropped */
  private gen = 0;
  private closed = false;

  constructor(
    private file: File,
    private samples: SampleInfo[],
    private config: VideoDecoderConfig,
    private times: number[]
  ) {
    this.decoder = this.makeDecoder();
  }

  private makeDecoder(): VideoDecoder {
    const gen = this.gen;
    const d = new VideoDecoder({
      output: (frame) => this.onFrame(frame, gen),
      error: (e) => this.fail(e instanceof Error ? e : new Error(String(e))),
    });
    d.configure(this.config);
    d.addEventListener("dequeue", () => void this.pump());
    return d;
  }

  private onFrame(frame: VideoFrame, gen: number) {
    if (gen !== this.gen || this.closed) {
      frame.close();
      return;
    }
    const ts = frame.timestamp / 1e6;
    const dur = (frame.duration ?? 40_000) / 1e6;
    // this frame is on screen from ts to ts + dur: it is the frame for every sampled time in there
    // (and for any earlier one whose frame never came out)
    const made: Promise<ImageBitmap>[] = [];
    while (this.target < this.times.length && this.times[this.target] < ts + dur - 1e-6) {
      const i = this.target++;
      const p = createImageBitmap(frame);
      made.push(p);
      const w = this.waiters.get(i);
      if (w) {
        this.waiters.delete(i);
        p.then(w.resolve, w.reject);
      } else {
        p.catch(() => undefined);
        this.ready.set(i, p);
      }
    }
    if (made.length) Promise.allSettled(made).finally(() => frame.close());
    else frame.close();
  }

  private async pump(): Promise<void> {
    if (this.feeding || this.closed || this.broken) return;
    this.feeding = true;
    const gen = this.gen;
    try {
      while (
        gen === this.gen &&
        !this.closed &&
        this.next < this.samples.length &&
        this.target < this.times.length &&
        this.ready.size < MAX_READY &&
        this.decoder.decodeQueueSize < MAX_DECODE_QUEUE
      ) {
        // read a run of samples in one go (they are usually contiguous in the file)
        const first = this.next;
        let last = first;
        while (
          last + 1 < this.samples.length &&
          last - first < 30 &&
          this.samples[last + 1].offset + this.samples[last + 1].size - this.samples[first].offset <= READ_SPAN &&
          this.samples[last + 1].offset >= this.samples[first].offset
        )
          last++;
        const start = this.samples[first].offset;
        const end = Math.max(...this.samples.slice(first, last + 1).map((s) => s.offset + s.size));
        const buf = await this.file.slice(start, end).arrayBuffer();
        if (gen !== this.gen || this.closed) return;
        for (let k = first; k <= last; k++) {
          const s = this.samples[k];
          this.decoder.decode(new EncodedVideoChunk({ type: s.key ? "key" : "delta", timestamp: s.ts, duration: s.dur, data: new Uint8Array(buf, s.offset - start, s.size) }));
        }
        this.next = last + 1;
      }
      if (gen === this.gen && !this.closed && !this.flushed && (this.next >= this.samples.length || this.target >= this.times.length)) {
        this.flushed = true;
        await this.decoder.flush();
        if (gen !== this.gen || this.closed) return;
        this.finished = true;
        // sampled times after the last frame (rounding at the very end of the clip)
        for (const [i, w] of this.waiters) {
          if (i >= this.target) {
            this.waiters.delete(i);
            w.reject(new Error("no frame at this time"));
          }
        }
      }
    } catch (e) {
      if (gen === this.gen && !this.closed) this.fail(e instanceof Error ? e : new Error(String(e)));
    } finally {
      this.feeding = false;
    }
    // more room may have opened up while this round was awaiting
    if (gen === this.gen && !this.closed && !this.flushed && this.ready.size < MAX_READY && this.decoder.decodeQueueSize < MAX_DECODE_QUEUE) void this.pump();
  }

  private fail(e: Error) {
    if (this.broken) return;
    this.broken = e;
    for (const w of this.waiters.values()) w.reject(e);
    this.waiters.clear();
  }

  frame(i: number): Promise<ImageBitmap> {
    if (this.broken) return Promise.reject(this.broken);
    const p = this.ready.get(i);
    if (p) {
      this.ready.delete(i);
      // frames before i that were never asked for (stopped early) are released
      for (const [k, q] of this.ready) if (k < i) {
        this.ready.delete(k);
        q.then((b) => b.close(), () => undefined);
      }
      void this.pump();
      return p;
    }
    if (i < this.target || (this.finished && i >= this.target)) {
      // already passed (asked out of order without rewind) or after the end
      return Promise.reject(new Error("no frame at this time"));
    }
    return new Promise<ImageBitmap>((resolve, reject) => {
      this.waiters.set(i, { resolve, reject });
      void this.pump();
    });
  }

  rewind(i: number) {
    if (this.broken || this.closed) return;
    this.gen++;
    for (const p of this.ready.values()) p.then((b) => b.close(), () => undefined);
    this.ready.clear();
    for (const w of this.waiters.values()) w.reject(new Error("rewound"));
    this.waiters.clear();
    try {
      this.decoder.close();
    } catch {
      /* already closed */
    }
    // restart from the last keyframe at or before times[i]
    const t = Math.round(this.times[i] * 1e6);
    let k = 0;
    for (let s = 0; s < this.samples.length; s++) if (this.samples[s].key && this.samples[s].ts <= t) k = s;
    this.next = k;
    this.target = i;
    this.flushed = false;
    this.finished = false;
    this.decoder = this.makeDecoder();
  }

  close() {
    this.closed = true;
    this.gen++;
    for (const p of this.ready.values()) p.then((b) => b.close(), () => undefined);
    this.ready.clear();
    for (const w of this.waiters.values()) w.reject(new Error("closed"));
    this.waiters.clear();
    try {
      this.decoder.close();
    } catch {
      /* already closed */
    }
  }
}
