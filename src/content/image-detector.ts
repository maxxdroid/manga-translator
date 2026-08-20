import { DetectedImage, Settings } from "../shared/types";

let imageCounter = 0;
const detectedImages = new Map<string, DetectedImage>();
const processedElements = new WeakSet<HTMLImageElement>();

export function findMangaImages(settings: Settings): DetectedImage[] {
  const images: HTMLImageElement[] = [];

  document.querySelectorAll("img").forEach((img) => {
    if (!processedElements.has(img) && isMangaImage(img, settings)) {
      images.push(img);
    }
  });

  document.querySelectorAll("canvas").forEach((canvas) => {
    const img = canvasToImage(canvas);
    if (img && !processedElements.has(img) && isMangaImage(img, settings)) {
      images.push(img);
    }
  });

  document.querySelectorAll("div, figure, section").forEach((el) => {
    const bgImg = backgroundImageToImage(el);
    if (bgImg && !processedElements.has(bgImg) && isMangaImage(bgImg, settings)) {
      images.push(bgImg);
    }
  });

  return images.map((img) => registerImage(img));
}

export function observeNewImages(
  settings: Settings,
  onNewImage: (image: DetectedImage) => void
): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Handle new nodes added to DOM
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          const el = node as Element;

          if (el.tagName === "IMG") {
            const img = el as HTMLImageElement;
            if (!processedElements.has(img) && isMangaImage(img, settings)) {
              onNewImage(registerImage(img));
            }
          }

          el.querySelectorAll("img").forEach((img) => {
            if (!processedElements.has(img) && isMangaImage(img, settings)) {
              onNewImage(registerImage(img));
            }
          });
        }
      }

      // Handle attribute changes (e.g., src being set dynamically)
      if (mutation.type === "attributes" && mutation.attributeName === "src") {
        const target = mutation.target as HTMLImageElement;
        if (target.tagName === "IMG" && !processedElements.has(target) && isMangaImage(target, settings)) {
          onNewImage(registerImage(target));
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });

  // Also do periodic scans for sites that load images without triggering mutations
  const intervalId = setInterval(() => {
    document.querySelectorAll("img").forEach((img) => {
      if (!processedElements.has(img) && isMangaImage(img, settings)) {
        onNewImage(registerImage(img));
      }
    });
  }, 2000);

  // Store interval for cleanup
  (observer as any)._intervalId = intervalId;

  return observer;
}

export function getDetectedImage(id: string): DetectedImage | undefined {
  return detectedImages.get(id);
}

export function getAllDetectedImages(): DetectedImage[] {
  return Array.from(detectedImages.values());
}

export function clearDetectedImages(): void {
  detectedImages.clear();
  imageCounter = 0;
}

function isMangaImage(img: HTMLImageElement, settings: Settings): boolean {
  // Skip images without a src or with empty src
  if (!img.src || img.src === "" || img.src === "about:blank") {
    return false;
  }

  // Skip tiny images (icons, thumbnails, avatars)
  const minSize = settings.minImageSize;
  const rect = img.getBoundingClientRect();

  if (rect.width < minSize || rect.height < minSize) {
    return false;
  }

  // Skip images that are likely not manga
  const src = img.src.toLowerCase();

  // Skip common non-manga image patterns
  if (
    src.includes("avatar") ||
    src.includes("icon") ||
    src.includes("logo") ||
    src.includes("emoji") ||
    src.includes("banner") ||
    src.includes("ad") ||
    src.includes("track") ||
    src.includes("pixel") ||
    src.includes("cover") ||
    src.includes("thumb") ||
    src.includes("button") ||
    src.includes("arrow") ||
    src.includes("social") ||
    src.includes("facebook") ||
    src.includes("tweet") ||
    src.includes("line.png")
  ) {
    return false;
  }

  // Skip data URIs (usually small decorative images)
  if (img.src.startsWith("data:") && img.src.length < 1000) {
    return false;
  }

  // Skip if image hasn't loaded yet (naturalWidth/Height = 0)
  // but allow images with class "protect" which are loaded via JS
  if (img.naturalWidth === 0 && img.naturalHeight === 0 && !img.classList.contains("protect")) {
    return false;
  }

  // Prefer tall/portrait images (manga-like aspect ratio)
  const aspectRatio = rect.height / rect.width;

  // If very wide and short, probably not manga
  if (aspectRatio < 0.3) {
    return false;
  }

  return true;
}

function registerImage(img: HTMLImageElement): DetectedImage {
  processedElements.add(img);
  const id = `manga-img-${++imageCounter}`;

  const detected: DetectedImage = {
    id,
    element: img,
    url: img.src,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    container: null,
  };

  detectedImages.set(id, detected);
  return detected;
}

function canvasToImage(canvas: HTMLCanvasElement): HTMLImageElement | null {
  try {
    const dataUrl = canvas.toDataURL("image/png");
    if (!dataUrl || dataUrl === "data:,") return null;

    const img = new Image();
    img.src = dataUrl;
    return img;
  } catch {
    return null;
  }
}

function backgroundImageToImage(el: Element): HTMLImageElement | null {
  const style = window.getComputedStyle(el);
  const bgImage = style.backgroundImage;

  if (!bgImage || bgImage === "none") return null;

  const urlMatch = bgImage.match(/url\(["']?(.+?)["']?\)/);
  if (!urlMatch) return null;

  const url = urlMatch[1];
  if (url.startsWith("data:") && url.length < 1000) return null;

  const img = new Image();
  img.src = url;
  return img;
}
