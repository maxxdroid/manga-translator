# OCR Pipeline

## Overview

The OCR pipeline uses PaddleOCR (PP-OCRv5) running entirely in the browser via ONNX Runtime Web. It operates in two stages: **text detection** (finding where text is) and **text recognition** (reading what the text says).

## Models

### Detection Model
- **Model:** `PP-OCRv5_server_det.onnx`
- **Size:** ~84MB
- **Input:** RGB image (dynamic size)
- **Output:** Polygon bounding boxes for each text region
- **Shared:** Used for all languages

### Recognition Models

| Language | Model | Size | Accuracy |
|----------|-------|------|----------|
| Japanese | `PP-OCRv5_server_rec.onnx` (ch model) | ~81MB | ~85% on manga |
| Korean | `korean_PP-OCRv5_mobile_rec.onnx` | ~13MB | 88% |

## Processing Pipeline

```
Input Image
    │
    ▼
┌─────────────────────┐
│ Preprocessing        │
│ - Resize to max 960px width
│ - Convert to RGB
│ - Normalize pixels   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Detection Model      │
│ - Run det.onnx      │
│ - Output: polygons  │
│ - Filter: min size, │
│   aspect ratio      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Crop Regions         │
│ - For each polygon: │
│   - Compute bbox    │
│   - Crop from image │
│   - Pad to rect     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Recognition Model    │
│ - Run rec.onnx      │
│ - CTC decoding       │
│ - Output: text +    │
│   confidence        │
└─────────────────────┘
```

## Implementation Details

### Web Worker

OCR runs in a Web Worker to keep the main thread responsive:

```typescript
// Main thread sends image to worker
worker.postMessage({ type: "OCR_REQUEST", imageData, language });

// Worker processes and returns results
worker.postMessage({ type: "OCR_RESULT", results: [...] });
```

### Caching

OCR results are cached by image URL + language to avoid re-processing:

```typescript
const cacheKey = `ocr:${imageUrl}:${language}`;
const cached = await chrome.storage.local.get(cacheKey);
if (cached[cacheKey]) return cached[cacheKey];
```

### Performance

- Detection: ~200-500ms per image (depending on size)
- Recognition: ~50-100ms per text region
- Total per image: ~300-1500ms (depending on number of text regions)
- First load: additional ~2-5s for model download (cached after)
