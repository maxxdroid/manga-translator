import { Settings, OcrResult, Translation } from "./types";
import { DEFAULT_SETTINGS, CACHE_CONFIG } from "./constants";

const SETTINGS_KEY = "manga-translate-settings";
// Bump when OCR/translation pipeline behavior changes so stale results from
// older (buggy) runs are never served from cache.
const CACHE_VERSION = "v2";

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
  const key = `ocr:${CACHE_VERSION}:${imageUrl}:${language}`;
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
  const key = `ocr:${CACHE_VERSION}:${imageUrl}:${language}`;
  await chrome.storage.local.set({
    [key]: { data: results, timestamp: Date.now() },
  });
}

export async function getCachedTranslation(
  sourceText: string,
  targetLanguage: string
): Promise<string | null> {
  const hash = simpleHash(sourceText);
  const key = `translation:${CACHE_VERSION}:${hash}:${targetLanguage}`;
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
  const key = `translation:${CACHE_VERSION}:${hash}:${targetLanguage}`;
  await chrome.storage.local.set({
    [key]: { data: translatedText, timestamp: Date.now() },
  });
}

function simpleHash(str: string): string {
  // FNV-1a 64-bit (non-cryptographic, collision-resistant for cache keys)
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, "0");
}
