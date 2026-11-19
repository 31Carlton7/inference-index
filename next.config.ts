import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Pages read data/ and docs/ from disk when they revalidate, so both ship with the server.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*.json", "./docs/*.md"],
  },
};

export default nextConfig;
