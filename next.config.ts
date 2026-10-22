import type { NextConfig } from "next";

// Static site for GitHub Pages: https://jackkrubb.github.io/leeco-hr/
// Everything runs in the browser and talks to Supabase through the hr_* functions.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/leeco-hr";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
