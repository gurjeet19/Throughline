import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tell Next.js to not bundle these server-only packages into the client.
  // They are only ever used in API routes / Server Components at runtime.
  serverExternalPackages: [
    "@neondatabase/serverless",
    "drizzle-orm",
    "better-auth",
    "inngest",
    "razorpay",
  ],
};

export default nextConfig;
