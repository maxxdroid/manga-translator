import { OcrResult, BoundingBox } from "../shared/types";
import { OCR_CONFIG } from "../shared/constants";

let ort: any = null;
let detectionSession: any = null;
let recognitionSession: any = null;
let dictionary: string[] = [];
let modelsAvailable = false;
let initError: string | null = null;
let currentLanguage = "ja";

function resolveUrl(path: string): string {
  return new URL(path, self.location.href).href;
}

// PaddleOCR preprocessing constants
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];
const REC_IMAGE_SHAPE = [3, 48, 320]; // C, H, W (W is dynamic)
const DET_LIMIT_SIDE_LEN = 960;
const DET_THRESH = 0.3;
const BOX_THRESH = 0.5;
const UNCLIP_RATIO = 1.5;

// Worker message handler
self.onmessage = async (event) => {
  const { type, id, imageData, language } = event.data;

  try {
    if (type === "INIT") {
      await initializeOcr(language);
      self.postMessage({
        type: "READY",
        modelsAvailable,
        error: initError,
      });
    } else if (type === "OCR_REQUEST") {
      console.log(`[MT:worker] OCR_REQUEST received:`, {
        id,
        imageW: imageData?.width,
        imageH: imageData?.height,
        dataLen: imageData?.data?.length,
        language,
      });
      if (!modelsAvailable) {
        self.postMessage({
          type: "RESULT",
          id,
          results: [],
          error: initError || "Models not available",
        });
        return;
      }
      const results = await processOcr(imageData, language);
      console.log(`[MT:worker] OCR_REQUEST done:`, {
        id,
        resultCount: results.length,
        results: results.map((r) => ({
          text: r.text,
          conf: r.confidence,
          bbox: r.bbox,
        })),
      });
      self.postMessage({ type: "RESULT", id, results });
    } else if (type === "DETECT_ONLY") {
      if (!modelsAvailable) {
        self.postMessage({
          type: "RESULT",
          id,
          results: [],
          error: initError || "Models not available",
        });
        return;
      }
      const boxes = await detectTextBoxes(imageData);
      const results: OcrResult[] = boxes.map((bbox) => ({
        bbox,
        text: "",
        confidence: 0,
      }));
      self.postMessage({ type: "RESULT", id, results });
    }
  } catch (error) {
    console.error("OCR Worker error:", error);
    self.postMessage({
      type: "ERROR",
      id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

async function initializeOcr(language?: string): Promise<void> {
  currentLanguage = language || "ja";
  initError = null;

  try {
    ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;

    // Try to load detection model
    const detModelUrl = resolveUrl(OCR_CONFIG.detectionModelPath);
    try {
      detectionSession = await ort.InferenceSession.create(detModelUrl);
    } catch (e) {
      initError = `Detection model failed: ${
        e instanceof Error ? e.message : String(e)
      } (${detModelUrl})`;
      console.warn("Detection model not available:", e, detModelUrl);
      return;
    }

    // Load recognition model
    await loadRecognitionModel(currentLanguage);
    modelsAvailable = true;
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error);
    console.warn("OCR initialization failed:", error);
    modelsAvailable = false;
  }
}

async function loadRecognitionModel(language: string): Promise<void> {
  let modelPath: string;
  let dictPath: string;

  if (language === "ko") {
    modelPath = resolveUrl(OCR_CONFIG.recognitionModels.ko);
    dictPath = resolveUrl(OCR_CONFIG.dictionaryPaths.ko);
  } else {
    modelPath = resolveUrl(OCR_CONFIG.recognitionModels.ja);
    dictPath = resolveUrl(OCR_CONFIG.dictionaryPaths.ja);
  }

  recognitionSession = await ort.InferenceSession.create(modelPath);

  // Load dictionary
  const dictResponse = await fetch(dictPath);
  if (!dictResponse.ok) {
    throw new Error(`Dictionary fetch failed: ${dictResponse.status} (${dictPath})`);
  }
  const dictText = await dictResponse.text();
  // Class layout mirrors TurboOCR/PaddleOCR: ["blank", ...every raw dict line].
  // Empty lines are SIGNIFICANT (the file starts with one) — filtering them
  // shifts every label by one and scrambles all decoded text.
  dictionary = [
    "blank",
    ...dictText.split("\n").map((line) => line.replace(/\r$/, "")),
  ];
}

async function processOcr(imageData: ImageData, language: string): Promise<OcrResult[]> {
  if (!detectionSession || !recognitionSession) {
    console.warn(`[MT:worker] processOcr: sessions not ready`, {
      detection: !!detectionSession,
      recognition: !!recognitionSession,
    });
    return [];
  }

  // Step 1: Detect text regions
  const textBoxes = await detectTextBoxes(imageData);
  console.log(`[MT:worker] detection produced ${textBoxes.length} boxes`);
  if (textBoxes.length === 0) return [];

  // Step 2: Recognize text in each region
  const results: OcrResult[] = [];

  for (const bbox of textBoxes) {
    try {
      const croppedImage = cropImageRegion(imageData, bbox);
      const { text, confidence } = await recognizeText(croppedImage);

      console.log(`[MT:worker] region recognize:`, {
        bbox,
        text: JSON.stringify(text),
        confidence: confidence.toFixed(3),
      });

      if (text.trim() && confidence > 0.3) {
        results.push({ bbox, text: text.trim(), confidence });
      }
    } catch (err) {
      console.warn("OCR failed for region:", bbox, err);
    }
  }

  return results;
}

async function detectTextBoxes(imageData: ImageData): Promise<BoundingBox[]> {
  const { tensor, originalWidth, originalHeight, scale } = preprocessForDetection(imageData);

  const inputName = detectionSession.inputNames[0];
  const results = await detectionSession.run({ [inputName]: tensor });

  const outputName = detectionSession.outputNames[0];
  const output = results[outputName];

  console.log(`[MT:worker] detection output:`, {
    dims: output.dims,
    sample: Array.from(output.data.slice(0, 10)),
    inputDims: tensor.dims,
  });

  const boxes = parseDetectionOutput(output, originalWidth, originalHeight, scale);
  return boxes;
}

function preprocessForDetection(imageData: ImageData): {
  tensor: any;
  originalWidth: number;
  originalHeight: number;
  scale: number;
} {
  const { data, width, height } = imageData;

  // Calculate resize dimensions
  let newWidth = width;
  let newHeight = height;
  let scale = 1;

  if (Math.max(height, width) > DET_LIMIT_SIDE_LEN) {
    if (height > width) {
      scale = DET_LIMIT_SIDE_LEN / height;
      newHeight = DET_LIMIT_SIDE_LEN;
      newWidth = Math.round(width * scale);
    } else {
      scale = DET_LIMIT_SIDE_LEN / width;
      newWidth = DET_LIMIT_SIDE_LEN;
      newHeight = Math.round(height * scale);
    }
  }

  // Make dimensions divisible by 32
  newWidth = Math.ceil(newWidth / 32) * 32;
  newHeight = Math.ceil(newHeight / 32) * 32;

  // Create resized and normalized image data in CHW format
  const tensorData = new Float32Array(3 * newHeight * newWidth);

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      // Source pixel coordinates (nearest neighbor)
      const srcX = Math.min(Math.floor((x / newWidth) * width), width - 1);
      const srcY = Math.min(Math.floor((y / newHeight) * height), height - 1);
      const srcIdx = (srcY * width + srcX) * 4;

      // Normalize: (pixel/255 - mean) / std
      const r = (data[srcIdx] / 255.0 - DET_MEAN[0]) / DET_STD[0];
      const g = (data[srcIdx + 1] / 255.0 - DET_MEAN[1]) / DET_STD[1];
      const b = (data[srcIdx + 2] / 255.0 - DET_MEAN[2]) / DET_STD[2];

      // CHW format
      const dstIdx = y * newWidth + x;
      tensorData[dstIdx] = r;
      tensorData[newHeight * newWidth + dstIdx] = g;
      tensorData[2 * newHeight * newWidth + dstIdx] = b;
    }
  }

  const tensor = new ort.Tensor("float32", tensorData, [1, 3, newHeight, newWidth]);

  return { tensor, originalWidth: width, originalHeight: height, scale };
}

function parseDetectionOutput(
  output: any,
  originalWidth: number,
  originalHeight: number,
  scale: number
): BoundingBox[] {
  const boxes: BoundingBox[] = [];
  const data = output.data as Float32Array;
  const dims = output.dims;

  // Output shape is [1, 1, H, W]
  const mapHeight = dims[2];
  const mapWidth = dims[3];

  // Scale factors from feature map to original image
  const scaleX = originalWidth / mapWidth;
  const scaleY = originalHeight / mapHeight;

  // Simple connected component labeling
  const visited = new Uint8Array(mapHeight * mapWidth);

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const idx = y * mapWidth + x;
      const prob = data[idx];

      if (prob > DET_THRESH && !visited[idx]) {
        // Found a new text region - flood fill to find bounds
        const box = floodFill(data, visited, x, y, mapWidth, mapHeight);

        // Scale back to original image coordinates
        const rawX = Math.max(0, Math.floor(box.minX * scaleX));
        const rawY = Math.max(0, Math.floor(box.minY * scaleY));
        const rawW = Math.min(
          originalWidth - rawX,
          Math.ceil((box.maxX - box.minX + 1) * scaleX)
        );
        const rawH = Math.min(
          originalHeight - rawY,
          Math.ceil((box.maxY - box.minY + 1) * scaleY)
        );

        // DB detection predicts a SHRUNKEN text region; the official
        // post-processing unclips (expands) each box before cropping.
        // Expand ~25% around the center as an axis-aligned approximation.
        const expandX = Math.round(rawW * UNCLIP_RATIO * 0.125);
        const expandY = Math.round(rawH * UNCLIP_RATIO * 0.125);
        const bbox: BoundingBox = {
          x: Math.max(0, rawX - expandX),
          y: Math.max(0, rawY - expandY),
          width: Math.min(originalWidth - Math.max(0, rawX - expandX), rawW + 2 * expandX),
          height: Math.min(originalHeight - Math.max(0, rawY - expandY), rawH + 2 * expandY),
        };

        // Filter out very small boxes
        if (bbox.width >= 10 && bbox.height >= 10) {
          boxes.push(bbox);
        }
      }
    }
  }

  return boxes;
}

function floodFill(
  data: Float32Array,
  visited: Uint8Array,
  startX: number,
  startY: number,
  width: number,
  height: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  const stack = [{ x: startX, y: startY }];
  let minX = startX, maxX = startX, minY = startY, maxY = startY;

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const idx = y * width + x;

    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (visited[idx]) continue;
    if (data[idx] <= DET_THRESH) continue;

    visited[idx] = 1;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    // 4-connected neighbors
    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }

  return { minX, maxX, minY, maxY };
}

function cropImageRegion(imageData: ImageData, bbox: BoundingBox): ImageData {
  const { data, width, height } = imageData;

  const cropX = Math.max(0, bbox.x);
  const cropY = Math.max(0, bbox.y);
  const cropW = Math.min(bbox.width, width - cropX);
  const cropH = Math.min(bbox.height, height - cropY);

  const croppedData = new Uint8ClampedArray(cropW * cropH * 4);

  for (let row = 0; row < cropH; row++) {
    const srcRow = cropY + row;
    if (srcRow >= height) break;

    for (let col = 0; col < cropW; col++) {
      const srcCol = cropX + col;
      if (srcCol >= width) break;

      const srcIdx = (srcRow * width + srcCol) * 4;
      const dstIdx = (row * cropW + col) * 4;

      croppedData[dstIdx] = data[srcIdx];
      croppedData[dstIdx + 1] = data[srcIdx + 1];
      croppedData[dstIdx + 2] = data[srcIdx + 2];
      croppedData[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return new ImageData(croppedData, cropW, cropH);
}

async function recognizeText(imageData: ImageData): Promise<{ text: string; confidence: number }> {
  const { data, width, height } = imageData;

  // Resize to height 48, maintain aspect ratio
  const targetHeight = 48;
  const maxRatio = 32; // max width/height ratio
  let targetWidth = Math.round((width / height) * targetHeight);
  targetWidth = Math.min(targetWidth, targetHeight * maxRatio);
  targetWidth = Math.max(targetWidth, 10);

  // Create tensor in CHW format with RAW pixel values (0-255). The
  // PP-OCRv5 "server" recognition models bake the normalization into the
  // graph, so normalized input produces blank output.
  const tensorData = new Float32Array(3 * targetHeight * targetWidth);

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(Math.floor((x / targetWidth) * width), width - 1);
      const srcY = Math.min(Math.floor((y / targetHeight) * height), height - 1);
      const srcIdx = (srcY * width + srcX) * 4;

      // PaddleOCR rec normalization: pixel/127.5 - 1  (== (x/255-0.5)/0.5).
      // Verified against ground truth; raw 0-255 input decodes garbage.
      const r = data[srcIdx] / 127.5 - 1;
      const g = (data[srcIdx + 1]) / 127.5 - 1;
      const b = (data[srcIdx + 2]) / 127.5 - 1;

      const dstIdx = y * targetWidth + x;
      tensorData[dstIdx] = r;
      tensorData[targetHeight * targetWidth + dstIdx] = g;
      tensorData[2 * targetHeight * targetWidth + dstIdx] = b;
    }
  }

  const tensor = new ort.Tensor("float32", tensorData, [1, 3, targetHeight, targetWidth]);

  const inputName = recognitionSession.inputNames[0];
  const results = await recognitionSession.run({ [inputName]: tensor });

  const outputName = recognitionSession.outputNames[0];
  const output = results[outputName];

  // CTC decode
  return ctcDecode(output);
}

function ctcDecode(output: any): { text: string; confidence: number } {
  const data = output.data as Float32Array;
  const dims = output.dims;
  const seqLength = dims[1];
  const numClasses = dims[2];

  let text = "";
  let totalConfidence = 0;
  let charCount = 0;
  let lastIdx = -1;

  for (let t = 0; t < seqLength; t++) {
    let maxIdx = 0;
    let maxValue = -Infinity;

    for (let c = 0; c < numClasses; c++) {
      const val = data[t * numClasses + c];
      if (val > maxValue) {
        maxValue = val;
        maxIdx = c;
      }
    }

    // CTC blank token is index 0
    if (maxIdx !== 0 && maxIdx !== lastIdx) {
      if (maxIdx < dictionary.length) {
        text += dictionary[maxIdx];
      }
      // Calculate softmax confidence
      const logits = data.slice(t * numClasses, (t + 1) * numClasses);
      totalConfidence += softmaxConfidence(maxValue, logits);
      charCount++;
    }

    lastIdx = maxIdx;
  }

  return {
    text,
    confidence: charCount > 0 ? totalConfidence / charCount : 0,
  };
}

function softmaxConfidence(value: number, logits: Float32Array): number {
  const maxLogit = Math.max(...Array.from(logits));
  const exp = Math.exp(value - maxLogit);
  let sumExp = 0;
  for (let i = 0; i < logits.length; i++) {
    sumExp += Math.exp(logits[i] - maxLogit);
  }
  return exp / sumExp;
}
