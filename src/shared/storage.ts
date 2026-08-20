import { Settings, OcrResult, Translation } from "./types";
import { DEFAULT_SETTINGS, CACHE_CONFIG } from "./constants";

const SETTINGS_KEY = "manga-translate-settings";

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

export async function getCachedOcr(
  imageUrl: string,
  language: string
): Promise<OcrResult[] | null> {
  const key = `ocr:${imageUrl}:${language}`;
  const result = await chrome.storage.local.get(key);
  const cached = result[key];

  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_CONFIG.ocrTTL) {
    await chrome.storage.local.remove(key);
    return null;
  }

  return cached.data;
}

export async function cacheOcr(
  imageUrl: string,
  language: string,
  results: OcrResult[]
): Promise<void> {
  const key = `ocr:${imageUrl}:${language}`;
  await chrome.storage.local.set({
    [key]: { data: results, timestamp: Date.now() },
  });
}

export async function getCachedTranslation(
  sourceText: string,
  targetLanguage: string
): Promise<string | null> {
  const hash = simpleHash(sourceText);
  const key = `translation:${hash}:${targetLanguage}`;
  const result = await chrome.storage.local.get(key);
  const cached = result[key];

  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_CONFIG.translationTTL) {
    await chrome.storage.local.remove(key);
    return null;
  }

  return cached.data;
}

export async function cacheTranslation(
  sourceText: string,
  targetLanguage: string,
  translatedText: string
): Promise<void> {
  const hash = simpleHash(sourceText);
  const key = `translation:${hash}:${targetLanguage}`;
  await chrome.storage.local.set({
    [key]: { data: translatedText, timestamp: Date.now() },
  });
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
