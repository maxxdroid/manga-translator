# Translation System

## Overview

Translation uses Chrome's built-in Translator API — a free, on-device translation service that requires no API keys. Text never leaves the user's machine.

## Chrome Translator API

### Supported Languages

The API supports 37 languages including:

| Language | Code | Direction |
|----------|------|-----------|
| Japanese | `ja` | ja → en |
| Korean | `ko` | ko → en |
| English | `en` | target language |
| Chinese | `zh` | zh → en |
| French | `fr` | fr → en |
| Spanish | `es` | es → en |

### How It Works

1. **First use:** Language model is downloaded (~few MB)
2. **Subsequent calls:** Instant (on-device inference)
3. **No network required** after initial model download

### API Usage

```typescript
if ("Translator" in self) {
  const translator = await Translator.create({
    sourceLanguage: "ja",
    targetLanguage: "en",
  });

  const { translated } = await translator.translate("こんにちは");
  // translated: "Hello"
}
```

## Fallback Strategy

### Unsupported Browsers

If the Translator API is not available (Firefox, Safari, older Chrome):
- Show a message to the user
- Offer BYOK (Bring Your Own Key) option post-MVP

### Unsupported Languages

If the source language is not supported:
- Skip translation for that text block
- Show original text in overlay (or no overlay)

## Caching

Translations are cached by source text hash + target language:

```typescript
const cacheKey = `translation:${hash(sourceText)}:${targetLanguage}`;
```

Cache TTL: 7 days (translations don't change often).

## Implementation

```typescript
// src/content/translator.ts

export class Translator {
  private instance: Translator | null = null;
  private sourceLang: string;
  private targetLang: string;

  async initialize(sourceLang: string, targetLang: string) {
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;

    if ("Translator" in self) {
      const availability = await Translator.availability({
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      });

      if (availability === "available") {
        this.instance = await Translator.create({
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
        });
      }
    }
  }

  async translate(text: string): Promise<string | null> {
    if (!this.instance) return null;

    // Check cache first
    const cached = await getCachedTranslation(text, this.targetLang);
    if (cached) return cached;

    const { translated } = await this.instance.translate(text);
    await cacheTranslation(text, this.targetLang, translated);
    return translated;
  }
}
```

## Post-MVP: BYOK (Bring Your Own Key)

Future versions will support user-provided API keys for:

- **DeepL** — higher quality translation
- **OpenAI** — GPT-4 for context-aware translation
- **Google Cloud Translation** — wide language support

API keys stored encrypted in Chrome Storage, never sent to our servers.
