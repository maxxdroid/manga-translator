# Overlay System

## Overview

The overlay system renders translated text on top of manga images using positioned DOM elements. The original image is never modified — overlays are purely visual additions.

## How It Works

### 1. Image Container Wrapping

Each detected manga image is wrapped in a relatively positioned container:

```html
<!-- Before -->
<img src="manga-page.jpg" />

<!-- After -->
<div class="manga-translate-container" style="position: relative; display: inline-block;">
  <img src="manga-page.jpg" />
  <div class="manga-translate-overlay">
    <!-- Overlay elements go here -->
  </div>
</div>
```

### 2. Overlay Element Rendering

For each translated text block, a positioned `<div>` is created:

```html
<div
  class="manga-translate-box"
  style="
    position: absolute;
    left: 120px;
    top: 45px;
    width: 80px;
    height: 60px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 4px;
    font-size: 12px;
    color: #000;
    pointer-events: none;
    z-index: 10000;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  "
>
  Hello
</div>
```

### 3. Positioning

Overlay position is calculated from OCR bounding boxes:

```typescript
function calculateOverlayPosition(
  bbox: { x: number; y: number; width: number; height: number },
  imageRect: DOMRect,
  imageNaturalWidth: number,
  imageNaturalHeight: number
) {
  const scaleX = imageRect.width / imageNaturalWidth;
  const scaleY = imageRect.height / imageNaturalHeight;

  return {
    left: bbox.x * scaleX,
    top: bbox.y * scaleY,
    width: bbox.width * scaleX,
    height: bbox.height * scaleY,
  };
}
```

### 4. Toggle Mechanism

Overlay visibility is controlled via a CSS class:

```css
.manga-translate-overlay.hidden {
  display: none;
}
```

Toggling:
```typescript
function toggleOverlay(visible: boolean) {
  const overlays = document.querySelectorAll(".manga-translate-overlay");
  overlays.forEach((el) => {
    el.classList.toggle("hidden", !visible);
  });
}
```

## Styling

### Default White Box

| Property | Value |
|----------|-------|
| Background | `white` |
| Border | `1px solid #ccc` |
| Border radius | `4px` |
| Font size | Auto-sized to fit |
| Text color | `#000` |
| Pointer events | `none` (non-blocking) |
| Z-index | `10000` |

### Auto-sizing

Text is auto-sized to fit within the bounding box:

```typescript
function calculateFontSize(
  text: string,
  boxWidth: number,
  boxHeight: number
): number {
  const avgCharWidth = boxWidth / text.length;
  const fontSize = Math.min(avgCharWidth * 1.2, boxHeight * 0.8);
  return Math.max(8, Math.min(fontSize, 24));
}
```

## Memory Management

Overlays are cleaned up when:
- Page navigates away
- Extension is disabled
- User clicks "Clear overlays" in popup

```typescript
function clearOverlays() {
  document.querySelectorAll(".manga-translate-container").forEach((el) => {
    const img = el.querySelector("img");
    if (img) {
      el.parentNode?.insertBefore(img, el);
      el.remove();
    }
  });
}
```

## Performance

- Overlay creation: <1ms per element
- Toggle: <10ms for all overlays on page
- Memory: ~1KB per overlay element
- No impact on image rendering performance
