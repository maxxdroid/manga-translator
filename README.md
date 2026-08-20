# Manga Translate

Chrome extension that detects and translates manga panels with clean overlay translations. Supports Japanese and Korean manga/manhwa.

## Features

- **Auto-detect manga images** on any website
- **OCR text detection** using PaddleOCR (PP-OCRv5) — supports vertical Japanese and Korean text
- **Free translation** via Chrome's built-in Translator API (on-device, no API key needed)
- **White box overlays** positioned over speech bubbles — original image untouched
- **Toggleable** — show/hide translations with one click or keyboard shortcut
- **Caching** — OCR and translation results cached for instant re-display

## Quick Start

```bash
# Install dependencies
npm install

# Development build (with hot reload)
npm run dev

# Production build
npm run build

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the dist/ folder
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+T` / `Cmd+Shift+T` | Toggle translations on/off |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

```
Page DOM → Image Detector → Text Detector (PaddleOCR) → OCR Recognition → Translation (Chrome API) → DOM Overlay
```

## Tech Stack

- **TypeScript** — type-safe codebase
- **Vite** — fast build tooling
- **React + Tailwind CSS** — popup UI
- **PaddleOCR JS** — client-side OCR (Japanese + Korean)
- **Chrome Translator API** — free on-device translation
- **Manifest V3** — Chrome extension platform

## Project Structure

```
manga-translate/
├── src/
│   ├── content/          # Injected into web pages
│   │   ├── content.ts    # Entry point
│   │   ├── image-detector.ts
│   │   ├── text-detector.ts
│   │   ├── ocr-worker.ts
│   │   ├── translator.ts
│   │   └── overlay.ts
│   ├── background/       # Service worker
│   │   └── service-worker.ts
│   ├── popup/            # Extension popup UI
│   │   ├── popup.tsx
│   │   └── popup.html
│   └── shared/           # Shared types and utilities
│       ├── types.ts
│       ├── constants.ts
│       └── storage.ts
├── docs/                 # Documentation
├── PROGRESS.md           # Development progress tracker
├── TODO.md               # Task breakdown
└── CHANGELOG.md          # Version history
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system design and data flow
- [Decisions](docs/DECISIONS.md) — why each technology was chosen
- [Development Guide](docs/DEVELOPMENT.md) — how to develop and test
- [OCR Pipeline](docs/OCR.md) — text detection and recognition details
- [Translation](docs/TRANSLATION.md) — translation system details
- [Overlay System](docs/OVERLAY.md) — DOM overlay rendering
- [Progress](PROGRESS.md) — current development status
- [Tasks](TODO.md) — granular task breakdown

## License

MIT
