// Headless OCR pipeline test: runs the same detection/recognition logic as the
// extension worker against real model files and a downloaded manga page, so we
// can validate the ML side without launching Chrome.
//
// Usage: node scripts/ocr-test.mjs [image.png]
//   image.png defaults to a cached downloaded manga page.
//
// Requires: npm i --no-save pngjs
import ort from "onnxruntime-web";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
ort.env.wasm.wasmPaths = pathToFileURL(
  resolve(root, "node_modules/onnxruntime-web/dist/") + "/"
).href;

const IMAGE_PATH = process.argv[2] || "C:/Users/Max/AppData/Local/Temp/opencode/try2.png";

// ---- constants (mirror src/shared/constants.ts + ocr-worker.ts) ----
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];
const DET_LIMIT_SIDE_LEN = 960;
const DET_THRESH = 0.3;
const MIN_TEXT_SIZE = 10;
const REC_HEIGHT = 48;
const REC_MAX_RATIO = 32;
const REC_CONF_THRESH = 0.3;

const source = await loadImage(IMAGE_PATH);
const canvas = createCanvas(source.width, source.height);
canvas.getContext("2d").drawImage(source, 0, 0);
const raw = canvas.getContext("2d").getImageData(0, 0, source.width, source.height);
console.log(`[test] image: ${raw.width} x ${raw.height}`);
const data = new Uint8ClampedArray(raw.data);
const img = { width: raw.width, height: raw.height };

// ---- detection preprocessing (mirrors ocr-worker.ts) ----
let width = img.width;
let height = img.height;
let scale = 1;
if (Math.max(height, width) > DET_LIMIT_SIDE_LEN) {
  if (height > width) {
    scale = DET_LIMIT_SIDE_LEN / height;
    height = DET_LIMIT_SIDE_LEN;
    width = Math.round(img.width * scale);
  } else {
    scale = DET_LIMIT_SIDE_LEN / width;
    width = DET_LIMIT_SIDE_LEN;
    height = Math.round(img.height * scale);
  }
}
width = Math.ceil(width / 32) * 32;
height = Math.ceil(height / 32) * 32;

const tensorData = new Float32Array(3 * height * width);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const srcX = Math.min(Math.floor((x / width) * img.width), img.width - 1);
    const srcY = Math.min(Math.floor((y / height) * img.height), img.height - 1);
    const srcIdx = (srcY * img.width + srcX) * 4;
    const dstIdx = y * width + x;
    tensorData[dstIdx] = (data[srcIdx] / 255.0 - DET_MEAN[0]) / DET_STD[0];
    tensorData[height * width + dstIdx] = (data[srcIdx + 1] / 255.0 - DET_MEAN[1]) / DET_STD[1];
    tensorData[2 * height * width + dstIdx] = (data[srcIdx + 2] / 255.0 - DET_MEAN[2]) / DET_STD[2];
  }
}

// ---- detection ----
const detSession = await ort.InferenceSession.create("public/models/det/det.onnx");
const detInput = detSession.inputNames[0];
const detOutput = detSession.outputNames[0];
const detResults = await detSession.run({
  [detInput]: new ort.Tensor("float32", tensorData, [1, 3, height, width]),
});
const output = detResults[detOutput];

// parse boxes (flood fill, mirrors ocr-worker.ts)
const mapH = output.dims[2];
const mapW = output.dims[3];
const scaleX = img.width / mapW;
const scaleY = img.height / mapH;
const visited = new Uint8Array(mapH * mapW);

function floodFill(mapData, startX, startY) {
  const stack = [{ x: startX, y: startY }];
  let minX = startX, maxX = startX, minY = startY, maxY = startY;
  while (stack.length > 0) {
    const { x, y } = stack.pop();
    const idx = y * mapW + x;
    if (x < 0 || x >= mapW || y < 0 || y >= mapH) continue;
    if (visited[idx]) continue;
    if (mapData[idx] <= DET_THRESH) continue;
    visited[idx] = 1;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  return { minX, maxX, minY, maxY };
}

const boxes = [];
for (let y = 0; y < mapH; y++) {
  for (let x = 0; x < mapW; x++) {
    const idx = y * mapW + x;
    if (output.data[idx] > DET_THRESH && !visited[idx]) {
      const box = floodFill(output.data, x, y);
      const bbox = {
        x: Math.max(0, Math.floor(box.minX * scaleX)),
        y: Math.max(0, Math.floor(box.minY * scaleY)),
        width: Math.min(img.width - Math.floor(box.minX * scaleX), Math.ceil((box.maxX - box.minX + 1) * scaleX)),
        height: Math.min(img.height - Math.floor(box.minY * scaleY), Math.ceil((box.maxY - box.minY + 1) * scaleY)),
      };
      if (bbox.width >= MIN_TEXT_SIZE && bbox.height >= MIN_TEXT_SIZE) boxes.push(bbox);
    }
  }
}
console.log(`[test] detected ${boxes.length} text regions`);

// ---- recognition ----
const recSession = await ort.InferenceSession.create("public/models/ch/rec-chinese-server.onnx");
const dictText = readFileSync("public/models/ch/ppocrv5_dict.txt", "utf-8");
// ["blank", ...every raw line] — empty lines are significant (off-by-one otherwise)
const dictionary = ["blank", ...dictText.split("\n").map((l) => l.replace(/\r$/, ""))];

function cropRegion(bbox) {
  // Mirror worker unclip: expand ~25% around center before cropping
  const expandX = Math.round(bbox.width * 0.125);
  const expandY = Math.round(bbox.height * 0.125);
  const cropX = Math.max(0, bbox.x - expandX);
  const cropY = Math.max(0, bbox.y - expandY);
  const cropW = Math.min(bbox.width + 2 * expandX, img.width - cropX);
  const cropH = Math.min(bbox.height + 2 * expandY, img.height - cropY);
  const cropped = new Uint8ClampedArray(cropW * cropH * 4);
  for (let row = 0; row < cropH; row++) {
    const srcRow = cropY + row;
    if (srcRow >= img.height) break;
    for (let col = 0; col < cropW; col++) {
      const srcCol = cropX + col;
      if (srcCol >= img.width) break;
      const si = (srcRow * img.width + srcCol) * 4;
      const di = (row * cropW + col) * 4;
      cropped[di] = data[si];
      cropped[di + 1] = data[si + 1];
      cropped[di + 2] = data[si + 2];
      cropped[di + 3] = data[si + 3];
    }
  }
  return { data: cropped, width: cropW, height: cropH };
}

async function recognize(crop) {
  let targetWidth = Math.round((crop.width / crop.height) * REC_HEIGHT);
  targetWidth = Math.min(targetWidth, REC_HEIGHT * REC_MAX_RATIO);
  targetWidth = Math.max(targetWidth, 10);
  const tData = new Float32Array(3 * REC_HEIGHT * targetWidth);
  for (let y = 0; y < REC_HEIGHT; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(Math.floor((x / targetWidth) * crop.width), crop.width - 1);
      const srcY = Math.min(Math.floor((y / REC_HEIGHT) * crop.height), crop.height - 1);
      const si = (srcY * crop.width + srcX) * 4;
      const di = y * targetWidth + x;
      // PaddleOCR rec normalization: pixel/127.5 - 1 (verified vs ground truth)
      tData[di] = crop.data[si] / 127.5 - 1;
      tData[REC_HEIGHT * targetWidth + di] = crop.data[si + 1] / 127.5 - 1;
      tData[2 * REC_HEIGHT * targetWidth + di] = crop.data[si + 2] / 127.5 - 1;
    }
  }
  const input = recSession.inputNames[0];
  const res = await recSession.run({
    [input]: new ort.Tensor("float32", tData, [1, 3, REC_HEIGHT, targetWidth]),
  });
  const out = res[recSession.outputNames[0]];
  const seqLen = out.dims[1];
  const numClasses = out.dims[2];
  let text = "";
  let lastIdx = -1;
  for (let t = 0; t < seqLen; t++) {
    let maxIdx = 0, maxValue = -Infinity;
    for (let c = 0; c < numClasses; c++) {
      const v = out.data[t * numClasses + c];
      if (v > maxValue) { maxValue = v; maxIdx = c; }
    }
    if (maxIdx !== 0 && maxIdx !== lastIdx && maxIdx < dictionary.length) {
      text += dictionary[maxIdx];
    }
    lastIdx = maxIdx;
  }
  return text;
}

const results = [];
for (const bbox of boxes) {
  const crop = cropRegion(bbox);
  const text = await recognize(crop);
  if (text.trim()) {
    results.push({ bbox, text: text.trim() });
  }
}

console.log(`[test] recognized ${results.length} regions`);
for (const r of results) {
  console.log(`  ${JSON.stringify(r.text).padEnd(24)} bbox=${JSON.stringify(r.bbox)}`);
}