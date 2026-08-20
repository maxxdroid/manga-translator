import { OcrResult, BoundingBox } from "../shared/types";
import { getCachedOcr, cacheOcr } from "../shared/storage";

let ocrWorker: Worker | null = null;
let ocrReady = false;
let ocrModelsAvailable = true;
let pendingCallbacks = new Map<
  string,
  { resolve: (results: OcrResult[]) => void; reject: (error: Error) => void }
>();

export async function initializeOcr(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      ocrWorker = new Worker(
        chrome.runtime.getURL("ocr-worker.js"),
        { type: "module" }
      );

      ocrWorker.onmessage = (event) => {
        const { type, id, results, error, modelsAvailable } = event.data;

        if (type === "READY") {
          ocrReady = true;
          ocrModelsAvailable = modelsAvailable !== false;
          resolve();
        } else if (type === "RESULT") {
          const pending = pendingCallbacks.get(id);
          if (pending) {
            pending.resolve(results);
            pendingCallbacks.delete(id);
          }
        } else if (type === "ERROR") {
          const pending = pendingCallbacks.get(id);
          if (pending) {
            pending.reject(new Error(error));
            pendingCallbacks.delete(id);
          }
        }
      };

      ocrWorker.onerror = (error) => {
        reject(new Error(`OCR Worker failed: ${error.message}`));
      };
    } catch (error) {
      reject(error);
    }
  });
}

export async function detectAndRecognizeText(
  imageUrl: string,
  language: string,
  imageData: ImageData
): Promise<OcrResult[]> {
  // Check cache first
  const cached = await getCachedOcr(imageUrl, language);
  if (cached) return cached;

  if (!ocrWorker || !ocrReady) {
    throw new Error("OCR not initialized");
  }

  return new Promise((resolve, reject) => {
    const id = `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    pendingCallbacks.set(id, { resolve, reject });

    ocrWorker!.postMessage({
      type: "OCR_REQUEST",
      id,
      imageData,
      language,
    });
  });
}

export async function detectTextRegions(
  imageData: ImageData
): Promise<BoundingBox[]> {
  if (!ocrWorker || !ocrReady) {
    throw new Error("OCR not initialized");
  }

  return new Promise((resolve, reject) => {
    const id = `det-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    pendingCallbacks.set(id, {
      resolve: (results: OcrResult[]) => {
        resolve(results.map((r) => r.bbox));
      },
      reject,
    });

    ocrWorker!.postMessage({
      type: "DETECT_ONLY",
      id,
      imageData,
    });
  });
}

export function terminateOcr(): void {
  if (ocrWorker) {
    ocrWorker.terminate();
    ocrWorker = null;
    ocrReady = false;
  }
  pendingCallbacks.clear();
}

export function isOcrReady(): boolean {
  return ocrReady;
}

export function isOcrModelsAvailable(): boolean {
  return ocrModelsAvailable;
}
