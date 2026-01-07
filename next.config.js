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
  serverExternalPackages: ['canvas'],

  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};