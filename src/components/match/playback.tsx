"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

/*
 * Playback clock for the match workspace.
 *
 * The current time lives in a tiny external store rather than React state, so publishing it
 * (≈11 Hz while playing) only re-renders components that actually read it, not the whole
 * workspace. Components that only need to seek use `usePlaybackControls()` and never re-render
 * on time changes.
 */

interface PlaybackControls {
  setTime: (t: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  seek: (t: number, opts?: { play?: boolean }) => void;
}

interface PlaybackValue extends PlaybackControls {
  /** throttled current time for panels (≈10 Hz while playing, exact after pause or seek) */
  time: number;
}

interface PlaybackStore extends PlaybackControls {
  getTime: () => number;
  subscribe: (cb: () => void) => () => void;
}

function createPlaybackStore(): PlaybackStore {
  let time = 0;
  const listeners = new Set<() => void>();
  const videoRef: React.RefObject<HTMLVideoElement | null> = { current: null };
  const setTime = (t: number) => {
    if (!Number.isFinite(t) || t === time) return;
    time = t;
    for (const l of listeners) l();
  };
  return {
    getTime: () => time,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setTime,
    videoRef,
    seek: (t, opts) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(v.duration || t, t));
      setTime(v.currentTime);
      if (opts?.play) void v.play();
    },
  };
}

const Ctx = createContext<PlaybackStore | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createPlaybackStore);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function useStore(): PlaybackStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("usePlayback outside PlaybackProvider");
  return s;
}

const serverTime = () => 0;

/** Subscribes to the playback clock. Re-renders on every published time. */
export function usePlaybackTime(): number {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.getTime, serverTime);
}

/** Seek and the video ref without subscribing to the clock. */
export function usePlaybackControls(): PlaybackControls {
  const s = useStore();
  return useMemo(() => ({ setTime: s.setTime, videoRef: s.videoRef, seek: s.seek }), [s]);
}

/** Time plus controls (subscribes to the clock). Prefer `usePlaybackControls` when time is not read. */
export function usePlayback(): PlaybackValue {
  const controls = usePlaybackControls();
  const time = usePlaybackTime();
  return useMemo(() => ({ ...controls, time }), [controls, time]);
}
