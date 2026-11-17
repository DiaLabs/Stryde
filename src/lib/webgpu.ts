/**
 * WebGPU adapter that runs on a real graphics card, or null.
 *
 * Chrome on Linux with only "Unsafe WebGPU Support" switched on hands out SwiftShader, a software
 * emulation of a GPU that runs on the processor: it reports itself as a fallback adapter and runs
 * the detection model 500x slower than the card (40 s and more per frame on a GTX 1650 machine),
 * which looks like a hang. Such adapters must never count as "the GPU".
 */
type Adapter = { info?: { isFallbackAdapter?: boolean; architecture?: string; vendor?: string; description?: string }; isFallbackAdapter?: boolean };
type Gpu = { requestAdapter(o?: object): Promise<Adapter | null> };

export function isSoftwareAdapter(a: Adapter): boolean {
  const info = a.info ?? {};
  return !!(info.isFallbackAdapter || a.isFallbackAdapter || /swiftshader|llvmpipe|software/i.test(`${info.architecture ?? ""} ${info.vendor ?? ""} ${info.description ?? ""}`));
}

export async function requestHardwareAdapter(gpu: Gpu | undefined): Promise<{ adapter: Adapter | null; softwareOnly: boolean }> {
  if (!gpu) return { adapter: null, softwareOnly: false };
  let softwareOnly = false;
  // prefer the discrete GPU on laptops with two
  for (const opts of [{ powerPreference: "high-performance" }, {}]) {
    try {
      const a = await gpu.requestAdapter(opts);
      if (!a) continue;
      if (isSoftwareAdapter(a)) {
        softwareOnly = true;
        continue;
      }
      return { adapter: a, softwareOnly: false };
    } catch {
      /* try the next option */
    }
  }
  return { adapter: null, softwareOnly };
}

/** What to switch on in Chrome so WebGPU reaches the graphics card (tested on Linux, Chrome 157). */
export const WEBGPU_FLAGS_HINT =
  "To use the GPU in Chrome, open chrome://flags and set Unsafe WebGPU Support to Enabled, Vulkan to Enabled, and Choose ANGLE graphics backend to Vulkan, then restart Chrome.";
