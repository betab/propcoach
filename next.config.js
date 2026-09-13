/** @type {import('next').NextConfig} */  
const nextConfig = {  
  typescript: { ignoreBuildErrors: false },  
  eslint: { ignoreDuringBuilds: true },  
  images: { remotePatterns: [] },  
}  
module.exports = nextConfig 
