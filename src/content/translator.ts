import { SourceLanguage, TargetLanguage } from "../shared/types";
import { getCachedTranslation, cacheTranslation } from "../shared/storage";

let translatorInstance: any = null;
let currentSourceLang: SourceLanguage | null = null;
let currentTargetLang: TargetLanguage | null = null;
let translatorAvailable = false;

// Normalize short BCP-47 codes to canonical tags the Chrome Translator API accepts
function normalizeLanguage(lang: string): string {
  const aliases: Record<string, string> = {
    zh: "zh-Hans",
    "zh-CN": "zh-Hans",
    "zh-SG": "zh-Hans",
    "zh-TW": "zh-Hant",
    "zh-HK": "zh-Hant",
  };
  return aliases[lang] || lang;
}

export async function initializeTranslator(
  sourceLang: SourceLanguage,
  targetLang: TargetLanguage
): Promise<boolean> {
  const normalizedTarget = normalizeLanguage(targetLang);

  // Check if Translator API is available
  if (!("Translator" in self)) {
    console.warn("Chrome Translator API not available");
    translatorAvailable = false;
    return false;
  }

  try {
    // Check availability for this language pair
    const availability = await (self as any).Translator.availability({
      sourceLanguage: sourceLang,
      targetLanguage: normalizedTarget,
    });

    if (availability === "unavailable") {
      console.warn(
        `Translation from ${sourceLang} to ${normalizedTarget} not available`
      );
      translatorAvailable = false;
      return false;
    }

    // Create translator instance
    translatorInstance = await (self as any).Translator.create({
      sourceLanguage: sourceLang,
      targetLanguage: normalizedTarget,
    });

    currentSourceLang = sourceLang;
    currentTargetLang = normalizedTarget;
    translatorAvailable = true;

    return true;
  } catch (error) {
    console.error("Failed to initialize translator:", error);
    translatorAvailable = false;
    return false;
  }
}

export async function translateText(
  text: string,
  targetLang?: TargetLanguage
): Promise<string | null> {
  if (!translatorAvailable || !translatorInstance) {
    return null;
  }

  const target = targetLang || currentTargetLang;
  if (!target) return null;

  // Check cache first
  const cached = await getCachedTranslation(text, target);
  if (cached) return cached;

  try {
    const { translated } = await translatorInstance.translate(text);

    // Cache the translation
    await cacheTranslation(text, target, translated);

    return translated;
  } catch (error) {
    console.error("Translation failed:", error);
    return null;
  }
}

export async function translateBatch(
  texts: string[],
  targetLang?: TargetLanguage
): Promise<(string | null)[]> {
  const results: (string | null)[] = [];

  for (const text of texts) {
    const translated = await translateText(text, targetLang);
    results.push(translated);
  }

  return results;
}

export function isTranslatorAvailable(): boolean {
  return translatorAvailable;
}

export function getCurrentLanguages(): {
  source: SourceLanguage | null;
  target: TargetLanguage | null;
} {
  return {
    source: currentSourceLang,
    target: currentTargetLang,
  };
}

export async function checkTranslatorSupport(): Promise<{
  available: boolean;
  supportedLanguages: string[];
}> {
  if (!("Translator" in self)) {
    return { available: false, supportedLanguages: [] };
  }

  try {
    const languages = await (self as any).Translator.languages();
    return { available: true, supportedLanguages: languages };
  } catch {
    return { available: false, supportedLanguages: [] };
  }
}
