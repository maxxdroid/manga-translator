import { Settings, DetectedImage, Translation, Message } from "../shared/types";
import { getSettings } from "../shared/storage";
import { findMangaImages, observeNewImages, getAllDetectedImages } from "./image-detector";
import { initializeOcr, detectAndRecognizeText, isOcrModelsAvailable } from "./text-detector";
import { initializeTranslator, translateText, isTranslatorAvailable } from "./translator";
import { wrapImageInContainer, renderOverlays, toggleOverlays, clearAllOverlays } from "./overlay";

let isProcessing = false;
let overlaysVisible = true;
let currentSettings: Settings | null = null;
let observer: MutationObserver | null = null;

async function init(): Promise<void> {
  try {
    currentSettings = await getSettings();

    // Initialize OCR
    await initializeOcr();

    // Initialize translator
    await initializeTranslator(
      currentSettings.sourceLanguage,
      currentSettings.targetLanguage
    );

    // Listen for messages from background/popup
    chrome.runtime.onMessage.addListener(handleMessage);

    // Auto-translate if enabled
    if (currentSettings.autoTranslate) {
      await translatePage();
    }

    // Observe for new images
    observer = observeNewImages(currentSettings, onNewImageDetected);
  } catch (error) {
    console.error("Manga Translate init failed:", error);
  }
}

function handleMessage(
  message: Message,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): void {
  switch (message.type) {
    case "DO_TRANSLATE_PAGE":
      translatePage().then(() => sendResponse({ success: true }));
      break;

    case "DO_TRANSLATE_IMAGE":
      translateSingleImage(message.imageUrl).then(() =>
        sendResponse({ success: true })
      );
      break;

    case "DO_TOGGLE_OVERLAY":
      toggleOverlays(message.visible);
      overlaysVisible = message.visible;
      sendResponse({ success: true });
      break;

    case "DO_UPDATE_SETTINGS":
      updateSettings(message.settings).then(() =>
        sendResponse({ success: true })
      );
      break;

    case "GET_STATUS":
      sendResponse({
        isProcessing,
        overlaysVisible,
        translatorAvailable: isTranslatorAvailable(),
        ocrModelsAvailable: isOcrModelsAvailable(),
        imageCount: getAllDetectedImages().length,
      });
      break;
  }
}

async function translatePage(): Promise<void> {
  if (isProcessing) return;

  isProcessing = true;
  sendStatusUpdate("detecting-images");

  try {
    // Find all manga images
    const images = findMangaImages(currentSettings!);

    if (images.length === 0) {
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
    // Wrap in container if needed
    wrapImageInContainer(image);

    sendStatusUpdate("detecting-text");

    // Get image data for OCR
    const imageData = await getImageData(image.element);
    if (!imageData) return;

    // Run OCR
    sendStatusUpdate("recognizing-text");
    const ocrResults = await detectAndRecognizeText(
      image.url,
      currentSettings!.sourceLanguage,
      imageData
    );

    if (ocrResults.length === 0) return;

    sendStatusUpdate("translating");

    // Translate all detected text
    const translations: Translation[] = [];

    for (const result of ocrResults) {
      const translatedText = await translateText(
        result.text,
        currentSettings!.targetLanguage
      );

      if (translatedText) {
        translations.push({
          originalText: result.text,
          translatedText,
          bbox: result.bbox,
          confidence: result.confidence,
        });
      }
    }

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
      console.warn("CORS error getting image data, trying fetch approach...");
      return getImageDataViaFetch(img);
    }
    console.error("Failed to get image data:", error);
    return null;
  }
}

async function getImageDataViaFetch(img: HTMLImageElement): Promise<ImageData | null> {
  try {
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
    console.error("Fetch approach also failed:", error);
    return null;
  }
}

function onNewImageDetected(image: DetectedImage): void {
  if (currentSettings?.autoTranslate && !isProcessing) {
    processImage(image);
  }
}

async function updateSettings(settings: Settings): Promise<void> {
  currentSettings = settings;

  // Reinitialize translator if language changed
  await initializeTranslator(settings.sourceLanguage, settings.targetLanguage);

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
