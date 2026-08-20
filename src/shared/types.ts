export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  bbox: BoundingBox;
  text: string;
  confidence: number;
}

export interface Translation {
  originalText: string;
  translatedText: string;
  bbox: BoundingBox;
  confidence: number;
}

export type SourceLanguage = "ja" | "ko";
export type TargetLanguage = string;

export interface Settings {
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  autoTranslate: boolean;
  overlayStyle: "white-box";
  minImageSize: number;
}

export type ProcessingStatus =
  | "idle"
  | "detecting-images"
  | "detecting-text"
  | "recognizing-text"
  | "translating"
  | "rendering-overlays"
  | "complete";

export interface DetectedImage {
  id: string;
  element: HTMLImageElement;
  url: string;
  width: number;
  height: number;
  container: HTMLDivElement | null;
}

export interface ImageTranslationData {
  imageId: string;
  imageUrl: string;
  ocrResults: OcrResult[];
  translations: Translation[];
  overlayElements: HTMLDivElement[];
}

// Message types for Chrome messaging
export type Message =
  | { type: "TRANSLATE_PAGE" }
  | { type: "TRANSLATE_IMAGE"; imageUrl: string }
  | { type: "TOGGLE_OVERLAY"; visible: boolean }
  | { type: "UPDATE_SETTINGS"; settings: Settings }
  | { type: "GET_STATUS" }
  | { type: "DO_TRANSLATE_PAGE" }
  | { type: "DO_TRANSLATE_IMAGE"; imageUrl: string }
  | { type: "DO_TOGGLE_OVERLAY"; visible: boolean }
  | { type: "DO_UPDATE_SETTINGS"; settings: Settings }
  | { type: "OCR_COMPLETE"; imageId: string; results: OcrResult[] }
  | { type: "TRANSLATION_COMPLETE"; imageId: string; translations: Translation[] }
  | { type: "STATUS_UPDATE"; status: ProcessingStatus }
  | { type: "ERROR"; message: string; code: string };
