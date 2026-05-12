/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Required for wagmi / viem / WalletConnect (browser-only APIs)
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      // WalletConnect uses these
      "pino-pretty": false,
      lokijs: false,
      encoding: false,
    };
    return config;
  },

  // Transpile packages that ship ESM-only
  transpilePackages: ["@rainbow-me/rainbowkit"],

  // Allow images from 0G Storage gateway
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.0g.ai",
      },
    ],
  },
};

module.exports = nextConfig;
