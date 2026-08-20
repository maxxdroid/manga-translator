import { OcrResult, BoundingBox, SourceLanguage, OcrImageData } from "../shared/types";
import { getCachedOcr, cacheOcr } from "../shared/storage";
import { log, warn } from "../shared/debug";

// OCR runs in a worker owned by the background service worker. Content
// scripts cannot reliably `new Worker(chrome.runtime.getURL(...))` because the
// page's Content-Security-Policy applies to content scripts; on CSP-locked
// sites (e.g. Fandom/wikia) the worker constructor throws a SecurityError
// DOMException. So all OCR work is delegated to the background via messages.
let ocrReady = false;
let ocrModelsAvailable = true;

export async function initializeOcr(
  language: SourceLanguage = "ja"
): Promise<void> {
  const response = await chrome.runtime.sendMessage({
    type: "OCR_INIT",
    language,
  });

  if (!response || response.error) {
    throw new Error(response?.error || "OCR initialization failed");
  }

  ocrReady = response.ready !== false;
  ocrModelsAvailable = response.modelsAvailable !== false;
  log("text-detector", "OCR initialized, models available:", ocrModelsAvailable);
}

export async function detectAndRecognizeText(
  imageUrl: string,
  language: string,
  imageData: ImageData
): Promise<OcrResult[]> {
  // Check cache first
  const cached = await getCachedOcr(imageUrl, language);
  if (cached) return cached;

  if (!ocrReady) {
    throw new Error("OCR not initialized");
  }

  log("text-detector", "sending OCR_REQUEST:", {
    imageUrl,
    width: imageData.width,
    height: imageData.height,
    dataBytes: imageData.data.length,
  });

  const response = await chrome.runtime.sendMessage({
    type: "OCR_REQUEST",
    language,
    imageData: {
      data: Array.from(imageData.data),
      width: imageData.width,
      height: imageData.height,
    } as OcrImageData,
  });

  if (!response || response.error) {
    throw new Error(response?.error || "OCR request failed");
  }

  const results = (response.results as OcrResult[]) ?? [];
  log("text-detector", "OCR results:", results.length, "regions");
  if (results.length > 0) {
    await cacheOcr(imageUrl, language, results);
  }
  return results;
}

export async function detectTextRegions(
  imageData: ImageData
): Promise<BoundingBox[]> {
  if (!ocrReady) {
    throw new Error("OCR not initialized");
  }

  const response = await chrome.runtime.sendMessage({
    type: "OCR_REQUEST",
    language: "ja",
    imageData: {
      data: Array.from(imageData.data),
      width: imageData.width,
      height: imageData.height,
    } as OcrImageData,
  });

  if (!response || response.error) {
    throw new Error(response?.error || "OCR request failed");
  }

  return ((response.results as OcrResult[]) ?? []).map((r) => r.bbox);
}

export async function terminateOcr(): Promise<void> {
  ocrReady = false;
  await chrome.runtime.sendMessage({ type: "OCR_TERMINATE" }).catch(() => {});
}

export function isOcrReady(): boolean {
  return ocrReady;
}

export function isOcrModelsAvailable(): boolean {
  return ocrModelsAvailable;
}