/** @type {import('next').NextConfig} */
module.exports = {
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