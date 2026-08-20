import { DetectedImage, Translation, BoundingBox } from "../shared/types";
import { OVERLAY_CONFIG } from "../shared/constants";

const CONTAINER_CLASS = "manga-translate-container";
const OVERLAY_CLASS = "manga-translate-overlay";
const BOX_CLASS = "manga-translate-box";
const HIDDEN_CLASS = "manga-translate-hidden";

let activeOverlays = new Map<string, HTMLDivElement[]>();

export function wrapImageInContainer(image: DetectedImage): HTMLDivElement {
  // Check if already wrapped
  if (image.container) {
    return image.container;
  }

  const img = image.element;

  // Create container
  const container = document.createElement("div");
  container.className = CONTAINER_CLASS;
  container.style.position = "relative";
  container.style.display = "inline-block";
  container.style.lineHeight = "0";

  // Insert container before image
  img.parentNode?.insertBefore(container, img);

  // Move image into container
  container.appendChild(img);

  image.container = container;
  return container;
}

export function renderOverlays(
  image: DetectedImage,
  translations: Translation[]
): HTMLDivElement[] {
  if (!image.container) {
    wrapImageInContainer(image);
  }

  const container = image.container!;
  const img = image.element;

  // Remove existing overlays for this image
  clearOverlaysForImage(image.id);

  // Create overlay container
  const overlayContainer = document.createElement("div");
  overlayContainer.className = OVERLAY_CLASS;
  overlayContainer.style.position = "absolute";
  overlayContainer.style.top = "0";
  overlayContainer.style.left = "0";
  overlayContainer.style.width = "100%";
  overlayContainer.style.height = "100%";
  overlayContainer.style.pointerEvents = "none";
  overlayContainer.style.zIndex = String(OVERLAY_CONFIG.zIndex);

  const overlayElements: HTMLDivElement[] = [];

  for (const translation of translations) {
    const box = createOverlayBox(translation, img);
    overlayContainer.appendChild(box);
    overlayElements.push(box);
  }

  container.appendChild(overlayContainer);
  activeOverlays.set(image.id, overlayElements);

  return overlayElements;
}

function createOverlayBox(
  translation: Translation,
  img: HTMLImageElement
): HTMLDivElement {
  const position = calculateOverlayPosition(
    translation.bbox,
    img.getBoundingClientRect(),
    img.naturalWidth || img.width,
    img.naturalHeight || img.height
  );

  const fontSize = calculateFontSize(
    translation.translatedText,
    position.width,
    position.height
  );

  const box = document.createElement("div");
  box.className = BOX_CLASS;
  box.style.position = "absolute";
  box.style.left = `${position.x}px`;
  box.style.top = `${position.y}px`;
  box.style.width = `${position.width}px`;
  box.style.height = `${position.height}px`;
  box.style.backgroundColor = OVERLAY_CONFIG.backgroundColor;
  box.style.border = `${OVERLAY_CONFIG.borderWidth}px solid ${OVERLAY_CONFIG.borderColor}`;
  box.style.borderRadius = `${OVERLAY_CONFIG.borderRadius}px`;
  box.style.padding = `${OVERLAY_CONFIG.padding}px`;
  box.style.fontSize = `${fontSize}px`;
  box.style.color = "#000000";
  box.style.fontFamily = OVERLAY_CONFIG.fontFamily;
  box.style.overflow = "hidden";
  box.style.display = "flex";
  box.style.alignItems = "center";
  box.style.justifyContent = "center";
  box.style.textAlign = "center";
  box.style.lineHeight = "1.2";
  box.style.wordBreak = "break-word";

  box.textContent = translation.translatedText;

  // Add tooltip with original text
  box.title = translation.originalText;

  return box;
}

function calculateOverlayPosition(
  bbox: BoundingBox,
  imageRect: DOMRect,
  naturalWidth: number,
  naturalHeight: number
): BoundingBox {
  const scaleX = imageRect.width / naturalWidth;
  const scaleY = imageRect.height / naturalHeight;

  return {
    x: Math.max(0, Math.floor(bbox.x * scaleX)),
    y: Math.max(0, Math.floor(bbox.y * scaleY)),
    width: Math.min(
      imageRect.width - Math.floor(bbox.x * scaleX),
      Math.ceil(bbox.width * scaleX)
    ),
    height: Math.min(
      imageRect.height - Math.floor(bbox.y * scaleY),
      Math.ceil(bbox.height * scaleY)
    ),
  };
}

function calculateFontSize(
  text: string,
  boxWidth: number,
  boxHeight: number
): number {
  if (!text) return OVERLAY_CONFIG.minFontSize;

  // Estimate characters that fit per line
  const charsPerLine = Math.max(1, Math.floor(boxWidth / 8));
  const lines = Math.ceil(text.length / charsPerLine);

  const lineHeight = boxHeight / Math.max(1, lines);
  const fontSize = Math.min(lineHeight * 0.8, boxWidth / Math.max(1, text.length) * 1.5);

  return Math.max(
    OVERLAY_CONFIG.minFontSize,
    Math.min(fontSize, OVERLAY_CONFIG.maxFontSize)
  );
}

export function toggleOverlays(visible: boolean): void {
  const overlays = document.querySelectorAll(`.${OVERLAY_CLASS}`);
  overlays.forEach((el) => {
    el.classList.toggle(HIDDEN_CLASS, !visible);
  });
}

export function clearOverlaysForImage(imageId: string): void {
  const elements = activeOverlays.get(imageId);
  if (elements) {
    elements.forEach((el) => el.remove());
    activeOverlays.delete(imageId);
  }

  // Also remove overlay container
  const container = document.querySelector(
    `[data-manga-translate-id="${imageId}"] .${OVERLAY_CLASS}`
  );
  container?.remove();
}

export function clearAllOverlays(): void {
  // Remove all overlay containers
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((el) => el.remove());

  // Unwrap containers
  document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach((el) => {
    const img = el.querySelector("img");
    if (img) {
      el.parentNode?.insertBefore(img, el);
      el.remove();
    }
  });

  activeOverlays.clear();
}

export function getOverlayCount(): number {
  return document.querySelectorAll(`.${BOX_CLASS}`).length;
}
