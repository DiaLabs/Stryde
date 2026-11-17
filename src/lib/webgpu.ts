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

/**
 * How to get WebGPU onto the graphics card in Chrome on Linux (tested with Chrome 157 on an
 * NVIDIA GTX 1650). chrome://flags alone can't do it there: it has no "ANGLE backend" choice,
 * and without Vulkan Chrome only offers the software emulator (or, with "Use WebGPU adapter:
 * OpenGLES", an OpenGL compatibility adapter that runs the model no faster than the CPU). Started
 * with these switches, WebGPU runs on the card at ~55 ms a frame.
 */
export const WEBGPU_FLAGS_HINT =
  "To use the GPU, start Chrome with: google-chrome --ozone-platform=x11 --enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan (on Linux, chrome://flags alone can't switch WebGPU to the graphics card).";
