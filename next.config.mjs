/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: "/tarjeta", destination: "/tarjeta/index.html" }];
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
