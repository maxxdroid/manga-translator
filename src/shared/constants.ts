import { Settings, SourceLanguage } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  sourceLanguage: "ja",
  targetLanguage: "en",
  autoTranslate: false,
  overlayStyle: "white-box",
  minImageSize: 100,
};

export const SOURCE_LANGUAGES: { code: SourceLanguage; name: string }[] = [
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
];

export const TARGET_LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "zh-Hans", name: "Chinese (Simplified)" },
];

export const OCR_CONFIG = {
  detectionModelPath: "models/det/det.onnx",
  recognitionModels: {
    ja: "models/ch/rec-chinese-server.onnx",
    ko: "models/ko/rec-korean.onnx",
  },
  dictionaryPaths: {
    ja: "models/ch/ppocrv5_dict.txt",
    ko: "models/ko/ppocrv5_korean_dict.txt",
  },
  maxImageWidth: 960,
  minTextRegionSize: 10,
};

export const OVERLAY_CONFIG = {
  backgroundColor: "#ffffff",
  borderColor: "#cccccc",
  borderWidth: 1,
  borderRadius: 4,
  padding: 4,
  minFontSize: 8,
  maxFontSize: 24,
  zIndex: 10000,
  fontFamily: "Arial, sans-serif",
};

export const CACHE_CONFIG = {
  ocrTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
  translationTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
};
