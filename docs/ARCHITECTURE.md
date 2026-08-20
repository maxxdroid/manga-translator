# Architecture

## Overview

Manga Translate is a Chrome Extension (Manifest V3) that processes manga images directly in the browser. No data is sent to external servers — all OCR and translation runs on-device.

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Popup UI    │◄──►│  Background  │◄──►│  Content     │  │
│  │  (React)     │    │  (SW)        │    │  Script      │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘  │
│                                                  │          │
│                                          ┌───────▼───────┐  │
│                                          │  Page DOM     │  │
│                                          └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Content Script (injected into every page)

The content script runs in the context of the web page. It has access to the DOM but runs in an isolated world.

| Module | Responsibility |
|--------|---------------|
| `content.ts` | Entry point. Initializes modules, handles messages from background/popup |
| `image-detector.ts` | Scans DOM for manga images. Uses MutationObserver for dynamic content |
| `text-detector.ts` | Runs PaddleOCR detection model to find text regions (bounding boxes) |
| `ocr-worker.ts` | Runs PaddleOCR recognition model in a Web Worker (non-blocking) |
| `translator.ts` | Wraps Chrome Translator API for JP/KR → EN translation |
| `overlay.ts` | Creates positioned DOM elements over detected text regions |

### Background Script (service worker)

| Module | Responsibility |
|--------|---------------|
| `service-worker.ts` | Message routing between popup ↔ content script. Handles extension lifecycle. Keyboard shortcut listener. |

### Popup (sidebar UI)

| Module | Responsibility |
|--------|---------------|
| `popup.tsx` | Settings UI: language selection, auto-translate toggle, manual translate button |

## Data Flow

```
1. PAGE LOAD / USER TRIGGER
   │
   ▼
2. IMAGE DETECTION (image-detector.ts)
   │ Scan DOM for <img>, <canvas>, background-image
   │ Filter by size (min 100x100px)
   │ Filter by aspect ratio (manga-like: tall/portrait)
   │
   ▼
3. TEXT DETECTION (text-detector.ts)
   │ Run PaddleOCR detection model on each image
   │ Output: array of bounding boxes [x, y, width, height]
   │
   ▼
4. OCR RECOGNITION (ocr-worker.ts)
   │ For each bounding box:
   │   - Crop image region
   │   - Run PaddleOCR recognition model
   │   - Output: recognized text + confidence score
   │
   ▼
5. TRANSLATION (translator.ts)
   │ For each recognized text block:
   │   - Check cache first
   │   - Call Chrome Translator API
   │   - Output: translated text
   │
   ▼
6. OVERLAY RENDERING (overlay.ts)
   │ For each translated text block:
   │   - Create positioned <div> element
   │   - White background, black text
   │   - Position over original text region
   │   - pointer-events: none (non-blocking)
```

## Message Passing

Content script ↔ Background ↔ Popup communicate via Chrome runtime messaging:

```typescript
// Message types
type Message =
  | { type: "TRANSLATE_PAGE" }           // Auto-translate all images
  | { type: "TRANSLATE_IMAGE"; url: string } // Translate specific image
  | { type: "TOGGLE_OVERLAY"; visible: boolean }
  | { type: "UPDATE_SETTINGS"; settings: Settings }
  | { type: "OCR_COMPLETE"; imageId: string; results: OcrResult[] }
  | { type: "TRANSLATION_COMPLETE"; imageId: string; translations: Translation[] };
```

## Caching Strategy

| Cache | Key | TTL | Storage |
|-------|-----|-----|---------|
| Image detection | page URL + image URL | Session | In-memory |
| OCR results | image URL + language | 7 days | Chrome Storage |
| Translation | source text hash + target lang | 7 days | Chrome Storage |

## Model Loading

PaddleOCR models are loaded lazily on first OCR request:

1. **Detection model** (~84MB) — shared across all languages
2. **Recognition model** — loaded per language:
   - Japanese (`ch` model): ~81MB
   - Korean (`ko` model): ~13MB

Models are cached in the browser after first download. Subsequent loads are instant.

## Security Considerations

- No data sent to external servers (all processing on-device)
- Content script runs in isolated world (can't access page JS)
- Overlay elements use `pointer-events: none` (can't be used for clickjacking)
- API keys (if BYOK is implemented) stored encrypted in Chrome Storage
