import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/tallinn-prayer-times/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/favicon-32.png",
        "icons/apple-touch-icon.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable-192.png",
        "icons/icon-maskable-512.png"
      ],
      manifest: {
        name: "Tallinn Prayer Times",
        short_name: "Tallinn PT",
        description: "Next prayer and daily times for Tallinn, Estonia.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0B1220",
        theme_color: "#0B1220",
        orientation: "any",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icons/icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        navigateFallback: "/tallinn-prayer-times/index.html"
      }
    })
  ],
  build: {
    outDir: "docs",
    emptyOutDir: true
  }
});
