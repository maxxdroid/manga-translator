import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, cpSync, renameSync, readFileSync, writeFileSync, rmSync } from "fs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-manifest",
      closeBundle() {
        const distDir = resolve(__dirname, "dist");
        mkdirSync(distDir, { recursive: true });

        // Copy manifest.json to dist
        copyFileSync(
          resolve(__dirname, "manifest.json"),
          resolve(distDir, "manifest.json")
        );

        // Copy icons to dist
        const iconsDir = resolve(__dirname, "public/icons");
        const distIconsDir = resolve(distDir, "icons");
        if (existsSync(iconsDir)) {
          mkdirSync(distIconsDir, { recursive: true });
          cpSync(iconsDir, distIconsDir, { recursive: true });
        }

        // Copy public folder to dist (for models, etc.)
        const publicDir = resolve(__dirname, "public");
        if (existsSync(publicDir)) {
          cpSync(publicDir, distDir, { recursive: true });
        }

        // Move popup.html from dist/src/popup/popup.html to dist/popup.html
        const popupHtmlSrc = resolve(distDir, "src/popup/popup.html");
        const popupHtmlDest = resolve(distDir, "popup.html");
        if (existsSync(popupHtmlSrc)) {
          // Fix script paths - remove leading slashes for Chrome extension compatibility
          let html = readFileSync(popupHtmlSrc, "utf-8");
          html = html.replace(/src="\/assets\//g, 'src="assets/');
          html = html.replace(/href="\/assets\//g, 'href="assets/');
          writeFileSync(popupHtmlDest, html);
          
          // Clean up src directory
          rmSync(resolve(distDir, "src"), { recursive: true, force: true });
        }

        console.log("✓ Manifest, icons, and public assets copied to dist/");
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    base: "./",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        content: resolve(__dirname, "src/content/content.ts"),
        background: resolve(__dirname, "src/background/service-worker.ts"),
        "ocr-worker": resolve(__dirname, "src/content/ocr-worker.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") return "content.js";
          if (chunkInfo.name === "background") return "background.js";
          if (chunkInfo.name === "ocr-worker") return "ocr-worker.js";
          return "assets/[name].js";
        },
        chunkFileNames: "assets/[name].js",
        assetFileNames: (chunkInfo) => {
          if (chunkInfo.name === "popup") return "popup.html";
          return "assets/[name][extname]";
        },
      },
    },
    sourcemap: process.env.NODE_ENV === "development" ? "inline" : false,
    minify: process.env.NODE_ENV === "production",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
