import { OcrResult, OcrImageData } from "../shared/types";
import { log, warn } from "../shared/debug";

// Offscreen document that owns the OCR worker. The background service worker
// cannot `new Worker(...)` (no `Worker` global in that context), and content
// scripts cannot create extension workers on pages with a strict CSP. An
// offscreen document is the supported place to spawn workers.
let ocrWorker: Worker | null = null;
let ocrReady = false;
let ocrModelsAvailable = true;
let pendingCallbacks = new Map<
  string,
  { resolve: (results: OcrResult[]) => void; reject: (error: Error) => void }
>();

chrome.runtime.onMessage.addListener(
  (
    message: any,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    switch (message?.type) {
      case "OFFSCREEN_OCR_INIT":
        initializeOcr(message.language)
          .then((resp) => {
            log("offscreen", "OCR initialized:", resp);
            sendResponse(resp);
          })
          .catch((error) => {
            warn("offscreen", "OCR init failed:", error);
            sendResponse({
              error: error instanceof Error ? error.message : "OCR init failed",
            });
          });
        return true;

      case "OFFSCREEN_OCR_REQUEST":
        requestOcr(message.imageData, message.language)
          .then((results) => {
            log("offscreen", "OCR results:", results.length, "regions");
            sendResponse({ results });
          })
          .catch((error) => {
            warn("offscreen", "OCR request failed:", error);
            sendResponse({
              error:
                error instanceof Error ? error.message : "OCR request failed",
            });
          });
        return true;

      case "OFFSCREEN_OCR_TERMINATE":
        terminateOcr();
        sendResponse({ received: true });
        return false;

      default:
        return false;
    }
  }
);

function initializeOcr(language: string): Promise<{
  ready: boolean;
  modelsAvailable: boolean;
}> {
  return new Promise((resolve, reject) => {
    try {
      ocrWorker = new Worker(chrome.runtime.getURL("ocr-worker.js"), {
        type: "module",
      });

      ocrWorker.onmessage = (event) => {
        const { type, id, results, error, modelsAvailable } = event.data;

        if (type === "READY") {
          ocrReady = true;
          ocrModelsAvailable = modelsAvailable !== false;
          if (error) {
            warn("offscreen", "OCR init error from worker:", error);
          }
          resolve({
            ready: true,
            modelsAvailable: ocrModelsAvailable,
            ...(error ? { error } : {}),
          });
        } else if (type === "RESULT") {
          const pending = pendingCallbacks.get(id);
          if (pending) {
            if (error) {
              warn("offscreen", "OCR request error from worker:", error);
              pending.reject(new Error(error));
            } else {
              pending.resolve(results);
            }
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
        warn("offscreen", "OCR worker error:", error.message);
        reject(new Error(`OCR Worker failed: ${error.message}`));
      };

      ocrWorker.postMessage({ type: "INIT", language });
    } catch (error) {
      reject(error);
    }
  });
}

function requestOcr(
  imageData: OcrImageData,
  language: string
): Promise<OcrResult[]> {
  log("offscreen", "requestOcr:", {
    width: imageData.width,
    height: imageData.height,
    dataBytes: imageData.data.length,
    language,
    workerExists: !!ocrWorker,
    ocrReady,
  });
  if (!ocrWorker || !ocrReady) {
    return Promise.reject(new Error("OCR not initialized"));
  }

  return new Promise((resolve, reject) => {
    const id = `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    pendingCallbacks.set(id, { resolve, reject });

    ocrWorker!.postMessage({
      type: "OCR_REQUEST",
      id,
      imageData: {
        data: imageData.data,
        width: imageData.width,
        height: imageData.height,
      },
      language,
    });
  });
}

function terminateOcr(): void {
  if (ocrWorker) {
    ocrWorker.terminate();
    ocrWorker = null;
  }
  ocrReady = false;
  pendingCallbacks.clear();
  log("offscreen", "OCR worker terminated");
}