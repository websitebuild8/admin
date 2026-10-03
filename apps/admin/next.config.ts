import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: { cpus: 1 },
  poweredByHeader: false,
  outputFileTracingIncludes: { '/*': ['./certs/supabase-root.crt'] },
};
export default nextConfig;
