# Manga Translate — Progress Tracker

## Current Status: 🟡 Project Scaffolded, Core Modules Not Started

---

## Phase 1: Project Setup
- [x] Initialize Vite + TypeScript project
- [x] Configure Manifest V3
- [x] Set up Tailwind CSS
- [x] Configure build pipeline (dev + production)
- [ ] Create extension icons (SVG placeholders)
- [ ] Install dependencies and verify build

## Phase 2: Image Detection
- [ ] Scan page for `<img>` elements
- [ ] Filter by size (min 100x100px)
- [ ] Filter by aspect ratio (manga-like: tall/portrait)
- [ ] Handle lazy-loaded images (MutationObserver)
- [ ] Handle `<canvas>` elements
- [ ] Handle CSS `background-image` elements
- [ ] Cache detected images per page

## Phase 3: OCR Pipeline
- [ ] Integrate `@paddleocr/paddleocr-js`
- [ ] Set up Web Worker for OCR processing
- [ ] Implement text detection (bounding boxes)
- [ ] Implement text recognition (JP + KR)
- [ ] Handle vertical text (manga-specific)
- [ ] Image preprocessing (resize, normalize)
- [ ] Cache OCR results per image URL + language
- [ ] Error handling for model load failures

## Phase 4: Translation
- [ ] Implement Chrome Translator API wrapper
- [ ] Detect API availability
- [ ] Handle first-use model download
- [ ] Graceful fallback for unsupported browsers
- [ ] Support JP → EN translation
- [ ] Support KR → EN translation
- [ ] Cache translations per source text + target language

## Phase 5: Overlay System
- [ ] Wrap images in relatively positioned containers
- [ ] Render white boxes over detected text regions
- [ ] Calculate overlay positions from OCR bounding boxes
- [ ] Auto-size text to fit within boxes
- [ ] Toggle show/hide via CSS class
- [ ] `pointer-events: none` for non-blocking interaction
- [ ] Clean up overlays on page unload
- [ ] Clean up overlays when extension is disabled

## Phase 6: Popup UI
- [ ] Settings: source language selector (JP/KR)
- [ ] Settings: target language selector
- [ ] Settings: auto-translate toggle
- [ ] Settings: manual translate button
- [ ] Processing status display
- [ ] Keyboard shortcut display
- [ ] Extension version display

## Phase 7: Background Service Worker
- [ ] Message routing (popup ↔ content script)
- [ ] Tab management
- [ ] Keyboard shortcut listener (Ctrl+Shift+T)
- [ ] Extension lifecycle events

## Phase 8: Polish & Testing
- [ ] Error handling & user feedback
- [ ] Performance optimization
- [ ] Memory management (cleanup overlays)
- [ ] Test on MangaDex
- [ ] Test on MangaPlus
- [ ] Test on other manga sites
- [ ] Chrome Web Store screenshots
- [ ] Chrome Web Store listing copy

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-18 | PaddleOCR over Tesseract | Better manga accuracy, JP+KR native support |
| 2026-08-18 | Chrome Translator API | Free, on-device, no API key required |
| 2026-08-18 | DOM overlay over Canvas | Non-destructive, easy toggle, lightweight |
| 2026-08-18 | Manifest V3 | Required for Chrome Web Store |
| 2026-08-18 | React for popup | Fast UI development, Tailwind integration |
| 2026-08-18 | Web Worker for OCR | Non-blocking, responsive UI during processing |

---

## Known Issues

_None yet — project just started._

## Future Ideas (Post-MVP)

- BYOK translation (DeepL, OpenAI, Google Cloud)
- Inpainting (remove original text, redraw background)
- Multiple overlay styles (transparent, side-by-side)
- Reading order detection (right-to-left)
- Webtoon long-scroll support
- Local file upload translation
- Payment system (credits or subscription)
