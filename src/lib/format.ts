export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatClock(seconds: number, withTenths = false): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return withTenths ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${m}:${Math.floor(s).toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatMetric(value: number | null, unit: string, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "–";
  if (unit === "%") return `${value.toFixed(0)}%`;
  if (unit === "m" && value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  if (["shots", "goals", "tracks"].includes(unit)) return value.toFixed(0);
  return `${value.toFixed(digits)}${unit === "players" ? "" : " " + unit}`;
}
