import { Settings, DetectedImage, Translation, Message } from "../shared/types";
import { getSettings } from "../shared/storage";
import { findMangaImages, observeNewImages, getAllDetectedImages } from "./image-detector";
import { initializeOcr, detectAndRecognizeText, isOcrModelsAvailable, terminateOcr } from "./text-detector";
import { initializeTranslator, translateText, isTranslatorAvailable } from "./translator";
import { wrapImageInContainer, renderOverlays, toggleOverlays, clearAllOverlays } from "./overlay";
import { log, warn } from "../shared/debug";

let isProcessing = false;
let overlaysVisible = true;
let currentSettings: Settings | null = null;
let observer: MutationObserver | null = null;

async function init(): Promise<void> {
  try {
    log("init", "content script initializing");

    // Register message listener BEFORE slow async init so messages
    // (GET_STATUS, DO_TRANSLATE_PAGE) work while models are loading
    chrome.runtime.onMessage.addListener(handleMessage);
    log("init", "message listener registered");

    currentSettings = await getSettings();
    log("init", "settings loaded", currentSettings);

    // Initialize OCR
    log("init", "initializing OCR...");
    await initializeOcr(currentSettings.sourceLanguage);
    log("init", "OCR ready, models available:", isOcrModelsAvailable());

    // Initialize translator
    log("init", "initializing translator...");
    await initializeTranslator(
      currentSettings.sourceLanguage,
      currentSettings.targetLanguage
    );
    log("init", "translator ready, available:", isTranslatorAvailable());

    // Auto-translate if enabled
    if (currentSettings.autoTranslate) {
      log("init", "auto-translate enabled, translating page");
      await translatePage();
    }

    // Observe for new images
    observer = observeNewImages(currentSettings, onNewImageDetected);
    log("init", "image observer started");
  } catch (error) {
    console.error("Manga Translate init failed:", error);
  }
}

function handleMessage(
  message: Message,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  switch (message.type) {
    case "DO_TRANSLATE_PAGE":
      translatePage().then(() => sendResponse({ success: true }));
      return true;

    case "DO_TRANSLATE_IMAGE":
      translateSingleImage(message.imageUrl).then(() =>
        sendResponse({ success: true })
      );
      return true;

    case "DO_TOGGLE_OVERLAY":
      overlaysVisible = !overlaysVisible;
      toggleOverlays(overlaysVisible);
      sendResponse({ success: true, visible: overlaysVisible });
      return false;

    case "DO_SET_OVERLAY":
      toggleOverlays(message.visible);
      overlaysVisible = message.visible;
      sendResponse({ success: true });
      return false;

    case "DO_UPDATE_SETTINGS":
      updateSettings(message.settings).then(() =>
        sendResponse({ success: true })
      );
      return true;

    case "GET_STATUS":
      sendResponse({
        isProcessing,
        overlaysVisible,
        translatorAvailable: isTranslatorAvailable(),
        ocrModelsAvailable: isOcrModelsAvailable(),
        imageCount: getAllDetectedImages().length,
      });
      return false;

    default:
      return false;
  }
}

async function translatePage(): Promise<void> {
  if (isProcessing) {
    log("translatePage", "already processing, skipping");
    return;
  }

  isProcessing = true;
  sendStatusUpdate("detecting-images");

  try {
    // Find all manga images
    log("translatePage", "finding manga images");
    const images = findMangaImages(currentSettings!);
    log("translatePage", "found", images.length, "manga images");

    if (images.length === 0) {
      warn("translatePage", "no manga images found on page");
      sendStatusUpdate("complete");
      return;
    }

    // Process each image
    for (const image of images) {
      await processImage(image);
    }

    sendStatusUpdate("complete");
  } catch (error) {
    console.error("Translation failed:", error);
    chrome.runtime.sendMessage({
      type: "ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      code: "TRANSLATION_FAILED",
    });
  } finally {
    isProcessing = false;
  }
}

async function translateSingleImage(imageUrl: string): Promise<void> {
  if (isProcessing) return;

  isProcessing = true;
  sendStatusUpdate("detecting-text");

  try {
    const images = findMangaImages(currentSettings!);
    const targetImage = images.find((img) => img.url === imageUrl);

    if (targetImage) {
      await processImage(targetImage);
    }

    sendStatusUpdate("complete");
  } catch (error) {
    console.error("Single image translation failed:", error);
  } finally {
    isProcessing = false;
  }
}

async function processImage(image: DetectedImage): Promise<void> {
  try {
    log("processImage", "processing image:", image.url);

    // Wrap in container if needed
    wrapImageInContainer(image);

    sendStatusUpdate("detecting-text");

    // Get image data for OCR
    const imageData = await getImageData(image.element);
    if (!imageData) {
      warn("processImage", "could not get image data for:", image.url);
      return;
    }
    log("processImage", "image data:", {
      width: imageData.width,
      height: imageData.height,
      dataBytes: imageData.data.length,
    });

    // Run OCR
    sendStatusUpdate("recognizing-text");
    log("processImage", "running OCR on", image.url);
    const ocrResults = await detectAndRecognizeText(
      image.url,
      currentSettings!.sourceLanguage,
      imageData
    );
    log("processImage", "OCR detected", ocrResults.length, "text regions");

    if (ocrResults.length === 0) return;

    sendStatusUpdate("translating");
    log("processImage", "translating", ocrResults.length, "text regions");

    // Translate all detected text. If the Translator API is unavailable,
    // fall back to showing the original OCR text so overlays still render.
    const translations: Translation[] = [];
    const translatorOk = isTranslatorAvailable();

    for (const result of ocrResults) {
      let translatedText: string | null = null;
      if (translatorOk) {
        translatedText = await translateText(
          result.text,
          currentSettings!.targetLanguage
        );
      }
      if (!translatedText) {
        translatedText = result.text;
      }

      translations.push({
        originalText: result.text,
        translatedText,
        bbox: result.bbox,
        confidence: result.confidence,
      });
    }

    log("processImage", "translated", translations.length, "text regions");
    if (translations.length === 0) return;

    sendStatusUpdate("rendering-overlays");

    // Render overlays
    renderOverlays(image, translations);

    // Notify background
    chrome.runtime.sendMessage({
      type: "TRANSLATION_COMPLETE",
      imageId: image.id,
      translations,
    });
  } catch (error) {
    console.error("Process image failed:", error);
  }
}

async function getImageData(img: HTMLImageElement): Promise<ImageData | null> {
  try {
    // Wait for image to be fully loaded
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        // Timeout after 5 seconds
        setTimeout(resolve, 5000);
      });
    }

    // Re-check after waiting
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      console.warn("Image has no dimensions:", img.src);
      return null;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (error) {
    // CORS error - try using fetch + blob approach
    if (error instanceof DOMException && error.name === "SecurityError") {
      warn("getImageData", "CORS taint, trying fetch approach:", img.src);
      return getImageDataViaFetch(img);
    }
    console.error("Failed to get image data:", error);
    return null;
  }
}

async function getImageDataViaFetch(img: HTMLImageElement): Promise<ImageData | null> {
  // Try content-script fetch first (only works with CORS-enabled hosts)
  try {
    log("getImageData", "fetching via content script:", img.src);
    const response = await fetch(img.src, { mode: "cors" });
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (error) {
    // Fall back to background fetch (uses extension host permissions, no CORS)
    warn(
      "getImageData",
      "content fetch failed, delegating to background:",
      (error as Error).message
    );
    return getImageDataViaBackgroundFetch(img);
  }
}

async function getImageDataViaBackgroundFetch(
  img: HTMLImageElement
): Promise<ImageData | null> {
  try {
    log("getImageData", "fetching via background:", img.src);
    const response = await chrome.runtime.sendMessage({
      type: "FETCH_IMAGE",
      url: img.src,
    });

    if (!response || response.error || !response.dataUrl) {
      warn("getImageData", "background fetch failed:", response?.error || "no data");
      return null;
    }

    const image = new Image();
    image.src = response.dataUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to decode fetched image"));
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    ctx.drawImage(image, 0, 0);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (error) {
    console.error("Background fetch approach failed:", error);
    return null;
  }
}

function onNewImageDetected(image: DetectedImage): void {
  if (currentSettings?.autoTranslate && !isProcessing) {
    processImage(image);
  }
}

async function updateSettings(settings: Settings): Promise<void> {
  const languageChanged =
    currentSettings?.sourceLanguage !== settings.sourceLanguage;
  const targetChanged = currentSettings?.targetLanguage !== settings.targetLanguage;

  currentSettings = settings;

  // Reinitialize OCR if source language changed
  if (languageChanged) {
    await terminateOcr();
    await initializeOcr(settings.sourceLanguage);
  }

  // Reinitialize translator if source or target language changed
  if (languageChanged || targetChanged) {
    await initializeTranslator(settings.sourceLanguage, settings.targetLanguage);
  }

  // Re-translate if auto-translate is on
  if (settings.autoTranslate) {
    clearAllOverlays();
    await translatePage();
  }
}

function sendStatusUpdate(status: string): void {
  chrome.runtime.sendMessage({
    type: "STATUS_UPDATE",
    status,
  });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (observer) {
    // Clear the periodic scan interval if it exists
    if ((observer as any)._intervalId) {
      clearInterval((observer as any)._intervalId);
    }
    observer.disconnect();
  }
});
