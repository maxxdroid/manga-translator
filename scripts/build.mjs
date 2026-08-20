import { build } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(root, "dist");

const watch = process.argv.includes("--watch");
const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex !== -1 ? process.argv[modeIndex + 1] : watch ? "development" : "production";
const isProduction = mode === "production";

function scriptBuild(name, entry, format) {
  return {
    configFile: false,
    root,
    mode,
    plugins: [],
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: isProduction ? false : "inline",
      minify: isProduction,
      watch: watch ? {} : undefined,
      rollupOptions: {
        input: { [name]: resolve(root, entry) },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]",
          format,
        },
      },
    },
  };
}

function offscreenBuild() {
  return {
    configFile: false,
    root,
    mode,
    plugins: [
      {
        name: "move-offscreen-html",
        closeBundle() {
          const src = resolve(distDir, "src/offscreen/ocr.html");
          const dest = resolve(distDir, "ocr.html");
          if (existsSync(src)) {
            let html = readFileSync(src, "utf-8");
            html = html.replace(/src="\/assets\//g, 'src="assets/');
            html = html.replace(/href="\/assets\//g, 'href="assets/');
            writeFileSync(dest, html);
            rmSync(resolve(distDir, "src"), { recursive: true, force: true });
          }
        },
      },
    ],
    build: {
      outDir: "dist",
      emptyOutDir: false,
      base: "./",
      sourcemap: isProduction ? false : "inline",
      minify: isProduction,
      watch: watch ? {} : undefined,
      rollupOptions: {
        input: {
          ocr: resolve(root, "src/offscreen/ocr.html"),
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: (chunkInfo) => {
            if (chunkInfo.name === "ocr") return "ocr.html";
            return "assets/[name][extname]";
          },
        },
      },
    },
  };
}

function popupBuild() {
  return {
    configFile: false,
    root,
    mode,
    plugins: [
      react(),
      {
        name: "copy-manifest",
        closeBundle() {
          mkdirSync(distDir, { recursive: true });

          copyFileSync(resolve(root, "manifest.json"), resolve(distDir, "manifest.json"));

          const iconsDir = resolve(root, "public/icons");
          const distIconsDir = resolve(distDir, "icons");
          if (existsSync(iconsDir)) {
            mkdirSync(distIconsDir, { recursive: true });
            cpSync(iconsDir, distIconsDir, { recursive: true });
          }

          const publicDir = resolve(root, "public");
          if (existsSync(publicDir)) {
            cpSync(publicDir, distDir, { recursive: true });
          }

          const popupHtmlSrc = resolve(distDir, "src/popup/popup.html");
          const popupHtmlDest = resolve(distDir, "popup.html");
          if (existsSync(popupHtmlSrc)) {
            let html = readFileSync(popupHtmlSrc, "utf-8");
            html = html.replace(/src="\/assets\//g, 'src="assets/');
            html = html.replace(/href="\/assets\//g, 'href="assets/');
            writeFileSync(popupHtmlDest, html);
            rmSync(resolve(distDir, "src"), { recursive: true, force: true });
          }

          console.log("✓ Manifest, icons, and public assets copied to dist/");
        },
      },
    ],
    build: {
      outDir: "dist",
      emptyOutDir: false,
      base: "./",
      sourcemap: isProduction ? false : "inline",
      minify: isProduction,
      watch: watch ? {} : undefined,
      rollupOptions: {
        input: {
          popup: resolve(root, "src/popup/popup.html"),
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: (chunkInfo) => {
            if (chunkInfo.name === "popup") return "popup.html";
            return "assets/[name][extname]";
          },
        },
      },
    },
  };
}

async function main() {
  rmSync(distDir, { recursive: true, force: true });

  const configs = [
    scriptBuild("content", "src/content/content.ts", "iife"),
    scriptBuild("background", "src/background/service-worker.ts", "es"),
    scriptBuild("ocr-worker", "src/content/ocr-worker.ts", "es"),
    offscreenBuild(),
    popupBuild(),
  ];

  for (const config of configs) {
    await build(config);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});