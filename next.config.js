/** @type {import('next').NextConfig} */
module.exports = {
  // Vercelの8GBビルド環境でNext.jsのLint・型検査まで同時実行すると
  // 大規模な既存画面でOOMになり得るため、Build本体からは分離する。
  // 型検査は `npm run typecheck` で継続して実施する。
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  images: {
    domains: ['drive.google.com'],
  },
  
  transpilePackages: ['react-pdf'],
  serverExternalPackages: ['canvas', 'pdfkit'],

  // Vercel Serverless環境でpublic/fontsをLambdaバンドルに含める
  outputFileTracingIncludes: {
    '/**': ['./public/fonts/**/*'],
  },

  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};
