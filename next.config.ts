import type { NextConfig } from "next";
import { getStaticSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getStaticSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
