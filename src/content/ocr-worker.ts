import { OcrResult, BoundingBox } from "../shared/types";

let ort: any = null;
let detectionSession: any = null;
let recognitionSession: any = null;
let dictionary: string[] = [];
let modelsAvailable = false;
let currentLanguage = "ja";

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
      self.postMessage({ type: "READY", modelsAvailable });
    } else if (type === "OCR_REQUEST") {
      if (!modelsAvailable) {
        self.postMessage({ type: "RESULT", id, results: [] });
        return;
      }
      const results = await processOcr(imageData, language);
      self.postMessage({ type: "RESULT", id, results });
    } else if (type === "DETECT_ONLY") {
      if (!modelsAvailable) {
        self.postMessage({ type: "RESULT", id, results: [] });
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

  try {
    ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;

    // Try to load detection model
    const detModelUrl = chrome.runtime.getURL("models/det/det.onnx");
    try {
      detectionSession = await ort.InferenceSession.create(detModelUrl);
    } catch (e) {
      console.warn("Detection model not available:", e);
      return;
    }

    // Load recognition model
    await loadRecognitionModel(currentLanguage);
    modelsAvailable = true;
  } catch (error) {
    console.warn("OCR initialization failed:", error);
    modelsAvailable = false;
  }
}

async function loadRecognitionModel(language: string): Promise<void> {
  let modelPath: string;
  let dictPath: string;

  if (language === "ko") {
    modelPath = chrome.runtime.getURL("models/ko/rec-korean.onnx");
    dictPath = chrome.runtime.getURL("models/ko/ppocrv5_korean_dict.txt");
  } else {
    modelPath = chrome.runtime.getURL("models/ch/rec-chinese-server.onnx");
    dictPath = chrome.runtime.getURL("models/ch/ppocrv5_dict.txt");
  }

  recognitionSession = await ort.InferenceSession.create(modelPath);

  // Load dictionary
  const dictResponse = await fetch(dictPath);
  const dictText = await dictResponse.text();
  dictionary = ["blank", ...dictText.split("\n").filter((line) => line.trim())];
}

async function processOcr(imageData: ImageData, language: string): Promise<OcrResult[]> {
  if (!detectionSession || !recognitionSession) {
    return [];
  }

  // Step 1: Detect text regions
  const textBoxes = await detectTextBoxes(imageData);
  if (textBoxes.length === 0) return [];

  // Step 2: Recognize text in each region
  const results: OcrResult[] = [];

  for (const bbox of textBoxes) {
    try {
      const croppedImage = cropImageRegion(imageData, bbox);
      const { text, confidence } = await recognizeText(croppedImage);

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

  return parseDetectionOutput(output, originalWidth, originalHeight, scale);
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
        const bbox: BoundingBox = {
          x: Math.max(0, Math.floor(box.minX * scaleX)),
          y: Math.max(0, Math.floor(box.minY * scaleY)),
          width: Math.min(
            originalWidth - Math.floor(box.minX * scaleX),
            Math.ceil((box.maxX - box.minX + 1) * scaleX)
          ),
          height: Math.min(
            originalHeight - Math.floor(box.minY * scaleY),
            Math.ceil((box.maxY - box.minY + 1) * scaleY)
          ),
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

  // Create normalized tensor in CHW format
  const tensorData = new Float32Array(3 * targetHeight * targetWidth);

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(Math.floor((x / targetWidth) * width), width - 1);
      const srcY = Math.min(Math.floor((y / targetHeight) * height), height - 1);
      const srcIdx = (srcY * width + srcX) * 4;

      // PaddleOCR rec normalization: (pixel / 255 - 0.5) / 0.5
      const r = (data[srcIdx] / 255.0 - 0.5) / 0.5;
      const g = (data[srcIdx + 1] / 255.0 - 0.5) / 0.5;
      const b = (data[srcIdx + 2] / 255.0 - 0.5) / 0.5;

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
