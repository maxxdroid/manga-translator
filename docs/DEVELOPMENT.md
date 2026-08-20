# Development Guide

## Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **npm** 9+ (or yarn/pnpm)
- **Google Chrome** 138+ (for Chrome Translator API)

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd manga-translate

# Install dependencies
npm install

# Start development build (watches for changes)
npm run dev
```

## Loading the Extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project
5. The extension icon should appear in your toolbar

## Loading After Changes

After running `npm run dev` and seeing the build complete:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the Manga Translate card
3. Reload any manga pages

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development build with watch mode |
| `npm run build` | Production build (type-checks first) |
| `npm run typecheck` | TypeScript type checking only |
| `npm run lint` | ESLint check |
| `npm run zip` | Create .zip for Chrome Web Store |

## Debugging

### Content Script
1. Navigate to a manga page
2. Open DevTools (F12)
3. Go to **Sources** → **Content scripts** → find `content.js`
4. Or right-click the page → **Inspect** → check Console

### Background Service Worker
1. Go to `chrome://extensions/`
2. Find Manga Translate
3. Click **Inspect views: service worker**
4. A DevTools window opens for the background script

### Popup
1. Right-click the extension icon
2. Click **Inspect popup**
3. A DevTools window opens for the popup

## Project Conventions

- **TypeScript** strict mode — no `any` types
- **ESLint + Prettier** for formatting
- **Conventional commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- **JSDoc comments** on all exported functions
- **No comments** in code unless absolutely necessary (per project rules)

## Adding a New Language

1. Identify the PaddleOCR recognition model for the language
2. Add the model path to `src/shared/constants.ts`
3. Add the language code mapping to `src/content/translator.ts`
4. Add the language option to the popup UI
5. Test with sample manga/manhwa images
6. Update `PROGRESS.md`

## Testing Checklist

- [ ] Extension loads without errors
- [ ] Images detected on MangaDex
- [ ] Images detected on MangaPlus
- [ ] Japanese OCR produces readable text
- [ ] Korean OCR produces readable text
- [ ] Translation produces correct English
- [ ] Overlay positioned correctly over text
- [ ] Toggle show/hide works
- [ ] Settings persist after closing popup
- [ ] No memory leaks (check DevTools → Memory)
