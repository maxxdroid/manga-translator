// Ground-truth recognition test: renders known Japanese text with a real font,
// runs it through det + rec with several preprocessing variants, and reports
// which variant decodes back the original text.
import ort from "onnxruntime-web";
import { PNG } from "pngjs";
import { createCanvas } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

ort.env.wasm.wasmPaths = pathToFileURL("C:/Users/Max/Desktop/manga-translator/manga-translator/node_modules/onnxruntime-web/dist/").href;

const TEXT = "あいうえお";

// Render text: black on white, height ~64px
const canvas = createCanvas(400, 80);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, 400, 80);
ctx.fillStyle = "#000000";
ctx.font = "48px sans-serif";
ctx.textBaseline = "middle";
ctx.fillText(TEXT, 10, 40);

const png = PNG.sync.read(canvas.toBuffer("image/png"));
const W = png.width, H = png.height;
const data = new Uint8ClampedArray(png.data);
console.log("[gt] rendered", TEXT, "at", W, "x", H);

const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];

// ---- detect ----
let dw = Math.ceil(W / 32) * 32, dh = Math.ceil(H / 32) * 32;
const dt = new Float32Array(3 * dh * dw);
for (let y = 0; y < dh; y++) {
  for (let x = 0; x < dw; x++) {
    const sx = Math.min(Math.floor((x / dw) * W), W - 1);
    const sy = Math.min(Math.floor((y / dh) * H), H - 1);
    const si = (sy * W + sx) * 4;
    const di = y * dw + x;
    dt[di] = (data[si] / 255 - DET_MEAN[0]) / DET_STD[0];
    dt[dh * dw + di] = (data[si + 1] / 255 - DET_MEAN[1]) / DET_STD[1];
    dt[2 * dh * dw + di] = (data[si + 2] / 255 - DET_MEAN[2]) / DET_STD[2];
  }
}
const detSession = await ort.InferenceSession.create("public/models/det/det.onnx");
const detRes = await detSession.run({ [detSession.inputNames[0]]: new ort.Tensor("float32", dt, [1, 3, dh, dw]) });
const dOut = detRes[detSession.outputNames[0]];
const mH = dOut.dims[2], mW = dOut.dims[3];
let minX = mW, maxX = 0, minY = mH, maxY = 0, count = 0;
for (let y = 0; y < mH; y++) for (let x = 0; x < mW; x++) {
  if (dOut.data[y * mW + x] > 0.3) {
    count++;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
}
console.log("[gt] prob>0.3 pixels:", count, "map box:", { minX, maxX, minY, maxY }, "of", mW, "x", mH);
if (count === 0) { console.log("[gt] DETECTION FOUND NOTHING"); process.exit(1); }

// scale to image coords + expand margin (unclip-ish)
const sx = W / mW, sy = H / mH;
let bx = Math.max(0, Math.floor(minX * sx)), by = Math.max(0, Math.floor(minY * sy));
let bw = Math.min(W - bx, Math.ceil((maxX - minX + 1) * sx));
let bh = Math.min(H - by, Math.ceil((maxY - minY + 1) * sy));
console.log("[gt] tight bbox:", { bx, by, bw, bh });

function crop(expandFrac) {
  const ex = Math.round(bw * expandFrac), ey = Math.round(bh * expandFrac);
  const cx = Math.max(0, bx - ex), cy = Math.max(0, by - ey);
  const cw = Math.min(W - cx, bw + 2 * ex), ch = Math.min(H - cy, bh + 2 * ey);
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let r = 0; r < ch; r++) for (let c = 0; c < cw; c++) {
    const si = ((cy + r) * W + (cx + c)) * 4, di = (r * cw + c) * 4;
    out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = 255;
  }
  return { data: out, width: cw, height: ch };
}

// ---- rec variants ----
const dictText = readFileSync("public/models/ch/ppocrv5_dict.txt", "utf-8");
const dictionary = ["blank", ...dictText.split("\n").map((l) => l.trim()).filter((l) => l)];

const recSession = await ort.InferenceSession.create("public/models/ch/rec-chinese-server.onnx");
console.log("[gt] rec inputs:", recSession.inputNames, "outputs:", recSession.outputNames);

async function runRec(c, layout, norm) {
  const th = 48;
  let tw = Math.round((c.width / c.height) * th);
  tw = Math.max(10, Math.min(tw, 48 * 32));
  const t = new Float32Array(3 * th * tw);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const sxi = Math.min(Math.floor((x / tw) * c.width), c.width - 1);
    const syi = Math.min(Math.floor((y / th) * c.height), c.height - 1);
    const si = (syi * c.width + sxi) * 4;
    let r = c.data[si], g = c.data[si + 1], b = c.data[si + 2];
    if (norm === "01") { r /= 255; g /= 255; b /= 255; }
    else if (norm === "std") { r = (r / 255 - 0.5) / 0.5; g = (g / 255 - 0.5) / 0.5; b = (b / 255 - 0.5) / 0.5; }
    const di = y * tw + x;
    if (layout === "CHW") {
      t[di] = r; t[th * tw + di] = g; t[2 * th * tw + di] = b;
    } else { // NHWC: interleaved
      const i2 = (y * tw + x) * 3;
      t[i2] = r; t[i2 + 1] = g; t[i2 + 2] = b;
    }
  }
  const dims = layout === "CHW" ? [1, 3, th, tw] : [1, th, tw, 3];
  const res = await recSession.run({ [recSession.inputNames[0]]: new ort.Tensor("float32", t, dims) });
  const out = res[recSession.outputNames[0]];
  const seqLen = out.dims[1], numClasses = out.dims[2];
  let text = "", last = -1;
  for (let ti = 0; ti < seqLen; ti++) {
    let mi = 0, mv = -Infinity;
    for (let ci = 0; ci < numClasses; ci++) {
      const v = out.data[ti * numClasses + ci];
      if (v > mv) { mv = v; mi = ci; }
    }
    if (mi !== 0 && mi !== last && mi < dictionary.length) text += dictionary[mi];
    last = mi;
  }
  return text;
}

for (const expand of [0, 0.15, 0.3]) {
  const c = crop(expand);
  for (const layout of ["CHW", "NHWC"]) {
    for (const norm of ["raw", "01", "std"]) {
      try {
        const text = await runRec(c, layout, norm);
        console.log(`[gt] expand=${expand} ${layout}/${norm}: ${JSON.stringify(text)}${text === TEXT ? "   <<<< MATCH" : ""}`);
      } catch (e) {
        console.log(`[gt] expand=${expand} ${layout}/${norm}: ERROR ${e.message.slice(0, 80)}`);
      }
    }
  }
}
