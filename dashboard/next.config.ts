import path from 'path';
import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../'),
  experimental: {
    middlewareClientMaxBodySize: '300mb',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
