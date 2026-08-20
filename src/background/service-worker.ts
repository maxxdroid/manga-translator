import { Message } from "../shared/types";

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
      case "UPDATE_SETTINGS":
        // Forward to active tab's content script
        forwardToActiveTab(message, sendResponse);
        return true;

      case "OCR_COMPLETE":
      case "TRANSLATION_COMPLETE":
      case "STATUS_UPDATE":
      case "ERROR":
        // These come from content scripts, log for now
        console.log("[Background]", message.type, message);
        sendResponse({ received: true });
        return false;

      case "GET_STATUS":
        // Forward to active tab's content script
        forwardToActiveTab(message, sendResponse);
        return true;
    }
  }
);

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-translations") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "DO_TOGGLE_OVERLAY",
          visible: true, // Will be toggled in content script
        });
      }
    });
  }
});

// Handle extension icon click (when no popup is configured)
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "DO_TRANSLATE_PAGE",
    });
  }
});

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
      sendResponse({ error: "No active tab" });
      return;
    }

    // Map popup message types to content script message types
    const contentMessage = mapMessageForContent(message);

    chrome.tabs.sendMessage(tab.id, contentMessage, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Message failed:", chrome.runtime.lastError.message);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response);
      }
    });
  } catch (error) {
    console.error("Forward to tab failed:", error);
    sendResponse({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function mapMessageForContent(message: Message): Message {
  switch (message.type) {
    case "TRANSLATE_PAGE":
      return { type: "DO_TRANSLATE_PAGE" };
    case "TRANSLATE_IMAGE":
      return { type: "DO_TRANSLATE_IMAGE", imageUrl: message.imageUrl };
    case "TOGGLE_OVERLAY":
      return { type: "DO_TOGGLE_OVERLAY", visible: message.visible };
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
    console.log(`[Background] Tab ${tabId} loaded`);
  }
});
