import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: { cpus: 1 },
  poweredByHeader: false,
  outputFileTracingIncludes: { '/*': ['./certs/supabase-root.crt', './public/templates/igo-packages.xlsx'] },
};
export default nextConfig;
