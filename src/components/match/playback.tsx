"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface PlaybackValue {
  /** throttled current time for panels (≈10 Hz) */
  time: number;
  setTime: (t: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  seek: (t: number, opts?: { play?: boolean }) => void;
}

const Ctx = createContext<PlaybackValue | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [time, setTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seek = useCallback((t: number, opts?: { play?: boolean }) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || t, t));
    setTime(v.currentTime);
    if (opts?.play) void v.play();
  }, []);
  const value = useMemo(() => ({ time, setTime, videoRef, seek }), [time, seek]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayback(): PlaybackValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlayback outside PlaybackProvider");
  return v;
}
