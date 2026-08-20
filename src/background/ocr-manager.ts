import { OcrResult, OcrImageData } from "../shared/types";
import { log, warn } from "../shared/debug";

// The OCR worker is hosted by an offscreen document: the background service
// worker has no `Worker` global, and content scripts can't spawn extension
// workers on pages with a strict CSP. We relay OCR work to the offscreen
// document (which owns the worker) via runtime messages.
const OFFSCREEN_URL = "ocr.html";

let ocrReady = false;
let ocrModelsAvailable = true;
let offscreenPromise: Promise<void> | null = null;

function ensureOffscreenDocument(): Promise<void> {
  if (!offscreenPromise) {
    offscreenPromise = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Run OCR (onnxruntime) inference in a dedicated worker",
      })
      .catch((error) => {
        // "Only a single offscreen document may be created" / already exists
        warn("ocr-manager", "offscreen doc create failed:", error);
      });
  }
  return offscreenPromise;
}

export async function initializeOcr(language: string): Promise<{
  ready: boolean;
  modelsAvailable: boolean;
}> {
  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    type: "OFFSCREEN_OCR_INIT",
    language,
  });

  if (!response || response.error) {
    throw new Error(response?.error || "OCR initialization failed");
  }

  ocrReady = response.ready !== false;
  ocrModelsAvailable = response.modelsAvailable !== false;
  log("ocr-manager", "OCR initialized, models available:", ocrModelsAvailable);
  return { ready: ocrReady, modelsAvailable: ocrModelsAvailable };
}

export async function requestOcr(
  imageData: OcrImageData,
  language: string
): Promise<OcrResult[]> {
  // The offscreen document (and its worker) may have been torn down if the
  // service worker restarted. Re-initialize lazily.
  if (!ocrReady) {
    await initializeOcr(language);
  }

  const response = await chrome.runtime.sendMessage({
    type: "OFFSCREEN_OCR_REQUEST",
    language,
    imageData: {
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    },
  });

  if (!response || response.error) {
    throw new Error(response?.error || "OCR request failed");
  }

  return (response.results as OcrResult[]) ?? [];
}

export function terminateOcr(): void {
  ocrReady = false;
  chrome.runtime
    .sendMessage({ type: "OFFSCREEN_OCR_TERMINATE" })
    .catch(() => {});
  log("ocr-manager", "OCR terminated");
}