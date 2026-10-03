import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the Expo app's *web* build (localhost:8081) call the API during development.
  // Native iOS/Android builds don't use CORS, and production stays same-origin only.
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:8081" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
          { key: "Access-Control-Expose-Headers", value: "Content-Length" },
        ],
      },
    ];
  },
};

export default nextConfig;
