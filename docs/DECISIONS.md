# Architecture Decisions

## Why PaddleOCR over Tesseract.js?

| Factor | Tesseract.js | PaddleOCR JS |
|--------|-------------|--------------|
| Manga accuracy | ~30% (vertical text, stylized fonts) | ~85-90% |
| Korean support | Basic (needs language pack) | Native (PP-OCRv5, 88% accuracy) |
| Japanese vertical text | Poor | Good |
| Browser SDK | Community-maintained | Official (`@paddleocr/paddleocr-js`) |
| Web Worker support | Manual setup | Built-in |
| Model size | 60MB+ per language | 13-81MB per language |

**Decision:** PaddleOCR for significantly better manga accuracy and official browser support.

## Why Chrome Translator API over Google Translate API?

| Factor | Google Translate API | Chrome Translator API |
|--------|---------------------|----------------------|
| Cost | $20/1M characters | Free |
| API key required | Yes | No |
| Privacy | Text sent to Google servers | On-device, never leaves machine |
| Speed | Network-dependent | Instant (after first model download) |
| Languages | 100+ | 37 |
| Offline | No | Yes |

**Decision:** Chrome Translator API for MVP (free, private, fast). BYOK fallback for unsupported browsers/languages post-MVP.

## Why DOM Overlay over Canvas Manipulation?

| Factor | Canvas | DOM Overlay |
|--------|--------|-------------|
| Original image | Modified (pixels replaced) | Untouched |
| Toggle | Re-render entire canvas | CSS class swap |
| Accessibility | Screen reader can't read | Screen reader can skip/parse |
| Performance | Heavy (full image re-render) | Light (HTML/CSS only) |
| Styling | Limited (pixel manipulation) | Full CSS control |
| Memory | High (duplicate image in memory) | Low (just positioned divs) |

**Decision:** DOM overlay for non-destructive, lightweight, toggleable translations.

## Why Manifest V3?

- MV2 is deprecated and disabled by default in Chrome
- Required for Chrome Web Store submission
- Better security model (service workers, no persistent background pages)
- Required for new Chrome features (offscreen documents, etc.)

## Why React for Popup?

- Component-based UI for settings
- Large ecosystem, easy to find help
- TypeScript support out of the box
- Tailwind CSS integration is seamless
- Popup is small enough that React overhead is negligible

## Why Web Worker for OCR?

- OCR is CPU-intensive (~300-1500ms per image)
- Web Worker keeps main thread responsive
- User can still scroll/interact while OCR runs
- PaddleOCR SDK has built-in worker support (`worker: true`)
