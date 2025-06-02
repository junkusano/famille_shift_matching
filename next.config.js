/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // ← ビルド時にESLintエラーを無視
  },
};

module.exports = nextConfig;
