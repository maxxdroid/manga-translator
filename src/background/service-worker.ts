import { Message } from "../shared/types";
import { log, warn } from "../shared/debug";
import { initializeOcr, requestOcr, terminateOcr } from "./ocr-manager";

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    // Route messages to the appropriate tab
    switch (message.type) {
      case "TRANSLATE_PAGE":
      case "TRANSLATE_IMAGE":
      case "TOGGLE_OVERLAY":
      case "SET_OVERLAY":
      case "UPDATE_SETTINGS":
      case "GET_STATUS":
        // Forward to active tab's content script
        log("background", "forwarding to tab:", message.type);
        forwardToActiveTab(message, sendResponse);
        return true;

      case "FETCH_IMAGE":
        log("background", "fetching image:", message.url);
        handleFetchImage(message.url).then((resp) => {
          log("background", "fetch result:", resp.error ? "error" : "ok");
          sendResponse(resp);
        });
        return true;

      case "OCR_INIT":
        log("background", "initializing OCR for language:", message.language);
        initializeOcr(message.language)
          .then((resp) => {
            log("background", "OCR initialized:", resp);
            sendResponse(resp);
          })
          .catch((error) => {
            warn("background", "OCR init failed:", error);
            sendResponse({
              error: error instanceof Error ? error.message : "OCR init failed",
            });
          });
        return true;

      case "OCR_REQUEST":
        log("background", "OCR request received:", {
          width: message.imageData?.width,
          height: message.imageData?.height,
          dataBytes: message.imageData?.data?.length,
          language: message.language,
        });
        requestOcr(message.imageData, message.language)
          .then((results) => {
            log("background", "OCR results:", results.length, "regions");
            sendResponse({ results });
          })
          .catch((error) => {
            warn("background", "OCR request failed:", error);
            sendResponse({
              error: error instanceof Error ? error.message : "OCR request failed",
            });
          });
        return true;

      case "OCR_TERMINATE":
        terminateOcr();
        sendResponse({ received: true });
        return false;

      case "OCR_COMPLETE":
      case "TRANSLATION_COMPLETE":
      case "STATUS_UPDATE":
      case "ERROR":
        // These come from content scripts, log for now
        log("background", "from content script:", message.type);
        sendResponse({ received: true });
        return false;
    }
  }
);

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-translations") {
    log("background", "keyboard shortcut: toggle-translations");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        sendToTab(tabs[0].id, { type: "DO_TOGGLE_OVERLAY" });
      }
    });
  }
});

async function handleFetchImage(
  url: string
): Promise<{ dataUrl?: string; error?: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    return { dataUrl };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

async function forwardToActiveTab(
  message: Message,
  sendResponse: (response?: unknown) => void
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      warn("background", "no active tab");
      sendResponse({ error: "No active tab" });
      return;
    }

    if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
      warn("background", "cannot inject into restricted page:", tab.url);
      sendResponse({ error: "Content script cannot run on this page type" });
      return;
    }

    const contentMessage = mapMessageForContent(message);

    // Try sending; if the content script isn't injected (e.g. page was open
    // before the extension loaded), inject it and retry.
    let response = await sendToTab(tab.id, contentMessage);
    if (response === null) {
      log("background", "content script missing, injecting into tab", tab.id);
      const injected = await injectContentScript(tab.id);
      if (!injected) {
        sendResponse({ error: "Could not inject content script" });
        return;
      }
      // Wait for the content script to register its message listener
      await sleep(300);
      response = await sendToTab(tab.id, contentMessage);
    }

    sendResponse(response ?? {});
  } catch (error) {
    warn("background", "forward to tab failed:", error);
    sendResponse({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function sendToTab(tabId: number, message: Message): Promise<unknown | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "";
        if (msg.includes("Receiving end does not exist")) {
          log("background", "receiving end does not exist for tab", tabId);
          resolve(null);
        } else {
          warn("background", "message failed:", msg);
          resolve({ error: msg });
        }
      } else {
        resolve(response);
      }
    });
  });
}

async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    log("background", "content script injected into tab", tabId);
    return true;
  } catch (error) {
    warn("background", "injection failed:", error);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapMessageForContent(message: Message): Message {
  switch (message.type) {
    case "TRANSLATE_PAGE":
      return { type: "DO_TRANSLATE_PAGE" };
    case "TRANSLATE_IMAGE":
      return { type: "DO_TRANSLATE_IMAGE", imageUrl: message.imageUrl };
    case "TOGGLE_OVERLAY":
      return { type: "DO_TOGGLE_OVERLAY" };
    case "SET_OVERLAY":
      return { type: "DO_SET_OVERLAY", visible: message.visible };
    case "UPDATE_SETTINGS":
      return { type: "DO_UPDATE_SETTINGS", settings: message.settings };
    case "GET_STATUS":
      return message;
    default:
      return message;
  }
}

// Handle tab updates (page navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    // Content script will re-initialize automatically
    log("background", "tab", tabId, "loaded");
  }
});