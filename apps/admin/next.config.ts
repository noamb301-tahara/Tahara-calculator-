import type { NextConfig } from "next";
import { resolve } from "node:path";

const config: NextConfig = {
  transpilePackages: ["@studio/shared", "@studio/remotion-scenes"],
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  turbopack: { root: resolve(import.meta.dirname, "../..") },
};
export default config;
