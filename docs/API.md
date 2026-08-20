# Internal API Reference

## Message Types

Content script ↔ Background ↔ Popup communicate via Chrome runtime messaging.

### Popup → Background

| Message | Payload | Description |
|---------|---------|-------------|
| `TRANSLATE_PAGE` | `{ autoTranslate: boolean }` | Trigger translation for all images on page |
| `TRANSLATE_IMAGE` | `{ imageUrl: string }` | Translate a specific image |
| `TOGGLE_OVERLAY` | `{ visible: boolean }` | Show/hide all overlays |
| `UPDATE_SETTINGS` | `{ settings: Settings }` | Update extension settings |
| `GET_STATUS` | `{}` | Get current translation status |

### Background → Content Script

| Message | Payload | Description |
|---------|---------|-------------|
| `DO_TRANSLATE_PAGE` | `{}` | Command to translate all images |
| `DO_TRANSLATE_IMAGE` | `{ imageUrl: string }` | Command to translate specific image |
| `DO_TOGGLE_OVERLAY` | `{ visible: boolean }` | Command to toggle overlays |
| `DO_UPDATE_SETTINGS` | `{ settings: Settings }` | Command to update settings |

### Content Script → Background

| Message | Payload | Description |
|---------|---------|-------------|
| `OCR_COMPLETE` | `{ imageId: string; results: OcrResult[] }` | OCR processing finished |
| `TRANSLATION_COMPLETE` | `{ imageId: string; translations: Translation[] }` | Translation finished |
| `STATUS_UPDATE` | `{ status: ProcessingStatus }` | Processing status update |
| `ERROR` | `{ message: string; code: string }` | Error occurred |

## Types

### Settings

```typescript
interface Settings {
  sourceLanguage: "ja" | "ko";
  targetLanguage: string;
  autoTranslate: boolean;
  overlayStyle: "white-box";
  minImageSize: number; // minimum image dimensions in px
}
```

### OcrResult

```typescript
interface OcrResult {
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text: string;
  confidence: number;
}
```

### Translation

```typescript
interface Translation {
  originalText: string;
  translatedText: string;
  bbox: BoundingBox;
  confidence: number;
}
```

### ProcessingStatus

```typescript
type ProcessingStatus =
  | "idle"
  | "detecting-images"
  | "detecting-text"
  | "recognizing-text"
  | "translating"
  | "rendering-overlays"
  | "complete";
```
