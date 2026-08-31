/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  devIndicators: false,
  outputFileTracingRoot: new URL("..", import.meta.url).pathname,
  // Se resuelven en tiempo de ejecución, no se empaquetan. sharp trae binarios
  // nativos y detect-libc, que usa child_process y fs: si webpack intenta
  // meterlo en un bundle, el build se cae.
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg", "sharp"],
  webpack(config, { isServer }) {
    if (isServer) {
      const prev = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...prev, "ffmpeg-static", "fluent-ffmpeg"];
    }
    return config;
  },
};

export default config;
