import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse usa pdfjs-dist internamente con workers nativos.
  // El bundler de Next/Turbopack no los empaca bien -> hay que tratarlo como external.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth", "xlsx", "mailparser"],
};

export default nextConfig;
