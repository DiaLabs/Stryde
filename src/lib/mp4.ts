/**
 * Minimal ISO-BMFF (MP4/MOV) reader to obtain the video track frame rate from
 * mdhd timescale and stts sample deltas. Reads only box headers and the moov box.
 */

async function readBytes(file: Blob, start: number, length: number): Promise<DataView> {
  const buf = await file.slice(start, Math.min(file.size, start + length)).arrayBuffer();
  return new DataView(buf);
}

function boxType(dv: DataView, off: number): string {
  return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
}

interface Box {
  type: string;
  start: number; // payload start (relative to view)
  end: number;
}

function children(dv: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let off = start;
  while (off + 8 <= end) {
    let size = dv.getUint32(off);
    const type = boxType(dv, off + 4);
    let header = 8;
    if (size === 1) {
      size = Number(dv.getBigUint64(off + 8));
      header = 16;
    } else if (size === 0) size = end - off;
    if (size < header || off + size > end) break;
    out.push({ type, start: off + header, end: off + size });
    off += size;
  }
  return out;
}

export async function mp4FrameRate(file: File): Promise<number | undefined> {
  if (!/\.(mp4|m4v|mov)$/i.test(file.name) && !/mp4|quicktime/.test(file.type)) return undefined;
  // locate moov among top-level boxes
  let off = 0;
  let moov: { start: number; size: number } | null = null;
  for (let i = 0; i < 64 && off + 8 <= file.size; i++) {
    const h = await readBytes(file, off, 16);
    let size = h.getUint32(0);
    const type = boxType(h, 4);
    if (size === 1) size = Number(h.getBigUint64(8));
    else if (size === 0) size = file.size - off;
    if (size < 8) return undefined;
    if (type === "moov") {
      moov = { start: off, size };
      break;
    }
    off += size;
  }
  if (!moov || moov.size > 64 * 1024 * 1024) return undefined;
  const dv = await readBytes(file, moov.start, moov.size);
  const top = children(dv, 8, dv.byteLength);
  for (const trak of top.filter((b) => b.type === "trak")) {
    const mdia = children(dv, trak.start, trak.end).find((b) => b.type === "mdia");
    if (!mdia) continue;
    const mdiaKids = children(dv, mdia.start, mdia.end);
    const hdlr = mdiaKids.find((b) => b.type === "hdlr");
    if (!hdlr || boxType(dv, hdlr.start + 8) !== "vide") continue;
    const mdhd = mdiaKids.find((b) => b.type === "mdhd");
    if (!mdhd) continue;
    const version = dv.getUint8(mdhd.start);
    const timescale = version === 1 ? dv.getUint32(mdhd.start + 20) : dv.getUint32(mdhd.start + 12);
    const minf = mdiaKids.find((b) => b.type === "minf");
    const stbl = minf && children(dv, minf.start, minf.end).find((b) => b.type === "stbl");
    const stts = stbl && children(dv, stbl.start, stbl.end).find((b) => b.type === "stts");
    if (!stts || !timescale) continue;
    const entries = dv.getUint32(stts.start + 4);
    let bestCount = 0;
    let bestDelta = 0;
    for (let i = 0; i < Math.min(entries, 4096); i++) {
      const count = dv.getUint32(stts.start + 8 + i * 8);
      const delta = dv.getUint32(stts.start + 12 + i * 8);
      if (count > bestCount && delta > 0) {
        bestCount = count;
        bestDelta = delta;
      }
    }
    if (!bestDelta) continue;
    const fps = timescale / bestDelta;
    return Math.round(fps * 1000) / 1000;
  }
  return undefined;
}
