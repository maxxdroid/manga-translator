# Tasks

## High Priority (MVP)

### Setup
- [ ] P0: Install npm dependencies and verify build works
- [ ] P0: Create placeholder extension icons (SVG)
- [ ] P0: Verify manifest.json is valid

### Image Detection
- [ ] P0: Implement `findMangaImages()` in `image-detector.ts`
- [ ] P0: Filter images by minimum size (100x100px)
- [ ] P0: Wrap detected images in positioned containers
- [ ] P0: MutationObserver for dynamically loaded images

### OCR
- [ ] P0: Initialize PaddleOCR with worker mode
- [ ] P0: Implement text detection (bounding box extraction)
- [ ] P0: Implement text recognition (text extraction)
- [ ] P0: Handle both Japanese and Korean models
- [ ] P0: Cache OCR results in Chrome Storage

### Translation
- [ ] P0: Implement Chrome Translator API wrapper
- [ ] P0: Check API availability on initialization
- [ ] P0: Translate JP/KR text to English
- [ ] P0: Cache translations

### Overlay
- [ ] P0: Create overlay container for each image
- [ ] P0: Render white boxes at bounding box positions
- [ ] P0: Auto-size text to fit boxes
- [ ] P0: Toggle visibility (show/hide)

### Popup
- [ ] P0: Create popup HTML + React component
- [ ] P0: Language selection (source: JP/KR, target: EN)
- [ ] P0: Auto-translate toggle
- [ ] P0: Manual "Translate" button
- [ ] P0: Show processing status

### Background
- [ ] P0: Message routing (popup ↔ content)
- [ ] P0: Keyboard shortcut listener (Ctrl+Shift+T)

---

## Medium Priority (Polish)

- [ ] P1: Performance optimization (batch OCR requests)
- [ ] P1: Error handling with user-friendly messages
- [ ] P1: Memory cleanup on overlay destroy
- [ ] P1: Handle images inside `<picture>` elements
- [ ] P1: Handle lazy-loaded images (IntersectionObserver)
- [ ] P1: Responsive overlay sizing on window resize

---

## Low Priority (Post-MVP)

- [ ] P2: BYOK translation (DeepL, OpenAI)
- [ ] P2: Multiple overlay styles
- [ ] P2: Custom font/size settings
- [ ] P2: Reading order detection
- [ ] P2: Webtoon support
- [ ] P2: Local file translation
- [ ] P2: Payment system
- [ ] P2: Chrome Web Store listing
