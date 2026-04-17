/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3001',
    RTMP_SERVER_URL: process.env.RTMP_SERVER_URL || 'rtmp://localhost:1935/live'
  }
};

module.exports = nextConfig;
