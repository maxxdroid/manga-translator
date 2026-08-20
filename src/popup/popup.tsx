import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  SourceLanguage,
  ProcessingStatus,
  Message,
} from "../shared/types";
import {
  DEFAULT_SETTINGS,
  SOURCE_LANGUAGES,
  TARGET_LANGUAGES,
} from "../shared/constants";

export function Popup() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [overlaysVisible, setOverlaysVisible] = useState(true);
  const [translatorAvailable, setTranslatorAvailable] = useState(false);
  const [ocrModelsAvailable, setOcrModelsAvailable] = useState(true);
  const [imageCount, setImageCount] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    getStatus();
  }, []);

  const loadSettings = async () => {
    const result = await chrome.storage.sync.get("manga-translate-settings");
    if (result["manga-translate-settings"]) {
      setSettings(result["manga-translate-settings"]);
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    setSettings(newSettings);
    await chrome.storage.sync.set({
      "manga-translate-settings": newSettings,
    });

    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "DO_UPDATE_SETTINGS",
          settings: newSettings,
        } as Message);
      }
    });
  };

  const getStatus = async () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "GET_STATUS" } as Message,
          (response: any) => {
            if (response) {
              setTranslatorAvailable(response.translatorAvailable ?? false);
              setOcrModelsAvailable(response.ocrModelsAvailable ?? true);
              setImageCount(response.imageCount ?? 0);
              setOverlaysVisible(response.overlaysVisible ?? true);
            }
          }
        );
      }
    });
  };

  const handleTranslate = useCallback(async () => {
    setIsTranslating(true);
    setStatus("detecting-images");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "DO_TRANSLATE_PAGE",
        } as Message);

        // Listen for status updates
        const listener = (msg: Message) => {
          if (msg.type === "STATUS_UPDATE") {
            setStatus(msg.status as ProcessingStatus);
          } else if (
            msg.type === "TRANSLATION_COMPLETE" ||
            msg.type === "ERROR"
          ) {
            setIsTranslating(false);
            setStatus("idle");
            chrome.runtime.onMessage.removeListener(listener);
            getStatus();
          }
        };
        chrome.runtime.onMessage.addListener(listener);
      }
    });
  }, []);

  const handleToggleOverlay = useCallback(async () => {
    const newVisible = !overlaysVisible;
    setOverlaysVisible(newVisible);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "DO_TOGGLE_OVERLAY",
          visible: newVisible,
        } as Message);
      }
    });
  }, [overlaysVisible]);

  const handleSourceLanguageChange = (lang: SourceLanguage) => {
    saveSettings({ ...settings, sourceLanguage: lang });
  };

  const handleTargetLanguageChange = (lang: string) => {
    saveSettings({ ...settings, targetLanguage: lang });
  };

  const handleAutoTranslateToggle = () => {
    saveSettings({ ...settings, autoTranslate: !settings.autoTranslate });
  };

  const getStatusText = (): string => {
    if (isTranslating) {
      switch (status) {
        case "detecting-images":
          return "Detecting images...";
        case "detecting-text":
          return "Detecting text regions...";
        case "recognizing-text":
          return "Reading text (OCR)...";
        case "translating":
          return "Translating...";
        case "rendering-overlays":
          return "Rendering overlays...";
        default:
          return "Processing...";
      }
    }
    return "Ready";
  };

  return (
    <div className="p-4 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">MT</span>
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Manga Translate</h1>
          <p className="text-xs text-gray-500">v0.1.0</p>
        </div>
      </div>

      {/* Status */}
      <div
        className={`p-3 rounded-lg mb-4 ${
          isTranslating
            ? "bg-brand-50 border border-brand-200"
            : "bg-gray-50 border border-gray-200"
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isTranslating ? "bg-brand-500 animate-pulse" : "bg-green-500"
            }`}
          />
          <span className="text-sm font-medium text-gray-700">
            {getStatusText()}
          </span>
        </div>
        {imageCount > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {imageCount} manga image{imageCount !== 1 ? "s" : ""} detected
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleTranslate}
          disabled={isTranslating}
          className="flex-1 bg-brand-600 text-white py-2 px-4 rounded-lg font-medium text-sm
                     hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {isTranslating ? "Translating..." : "Translate Page"}
        </button>
        <button
          onClick={handleToggleOverlay}
          className="bg-gray-100 text-gray-700 py-2 px-3 rounded-lg font-medium text-sm
                     hover:bg-gray-200 transition-colors"
          title={overlaysVisible ? "Hide overlays" : "Show overlays"}
        >
          {overlaysVisible ? "👁" : "👁‍🗨"}
        </button>
      </div>

      {/* Settings */}
      <div className="space-y-3">
        {/* Source Language */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Source Language
          </label>
          <select
            value={settings.sourceLanguage}
            onChange={(e) =>
              handleSourceLanguageChange(e.target.value as SourceLanguage)
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {SOURCE_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Target Language */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Target Language
          </label>
          <select
            value={settings.targetLanguage}
            onChange={(e) => handleTargetLanguageChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Auto Translate Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Auto-translate</p>
            <p className="text-xs text-gray-500">
              Translate new images automatically
            </p>
          </div>
          <button
            onClick={handleAutoTranslateToggle}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.autoTranslate ? "bg-brand-600" : "bg-gray-300"
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full
                          transition-transform shadow-sm ${
                            settings.autoTranslate ? "translate-x-5" : ""
                          }`}
            />
          </button>
        </div>
      </div>

      {/* Translator Status */}
      {!translatorAvailable && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700">
            Chrome Translator API not available. Translation may not work.
            Requires Chrome 138+ on desktop.
          </p>
        </div>
      )}

      {/* OCR Models Status */}
      {!ocrModelsAvailable && (
        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700">
            OCR models not loaded. Text detection will not work.
            Run <code>bash scripts/download-models.sh</code> to download models.
          </p>
        </div>
      )}

      {/* Keyboard Shortcut */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Keyboard shortcut:{" "}
          <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">
            Ctrl+Shift+T
          </kbd>
        </p>
      </div>
    </div>
  );
}
