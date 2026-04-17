# Gemini API model lineup (how this repo maps to Google’s catalog)

Google publishes the authoritative model list, naming rules, deprecations, and terms here:

- [Gemini API models](https://ai.google.dev/gemini-api/docs/models)
- [Model deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- [Terms of Service](https://ai.google.dev/gemini-api/terms)

This file is a **short orientation** for eval runs; always confirm the exact **model string** you pass to `getGenerativeModel({ model })` against the docs above.

---

## Naming: stable, preview, latest, experimental

From Google’s docs (as of the 2025 naming guidance): **stable** strings (e.g. `gemini-2.5-flash`) point at a fixed release suitable for most production use; **preview** / **latest** / **experimental** aliases can move or be retired with notice. Prefer explicit stable IDs for anything you ship.

---

## Deprecations that affect eval defaults

- **Gemini 2.0 Flash** is in the deprecated bucket on Google’s deprecations page — we **do not** use it as a default candidate anymore.
- **Gemini 3 Pro Preview** was shut down (per Google’s deprecation notice); use **Gemini 3.1 Pro Preview** (or another current doc entry) if you intentionally want the 3.1 preview track.
- Newer **Gemini 3.x** previews (Flash, Pro, image, live, TTS, etc.) are documented on the models page; wire them by swapping `FREE_TIER_EVAL_MODEL_IDS`, `STANDARD_EVAL_MODEL_IDS`, or env overrides.

---

## How **this** repository uses Gemini

| Mode | Google models | Notes |
|------|----------------|-------|
| **Direct API (default cross-vendor)** | Third candidate: **`gemini-2.5-pro`** | Wired via `createGemini25ProAdapter` in `app/eval/adapters/google.ts`. |
| **Free-tier Google-only** | **`gemini-2.5-flash-lite`**, **`gemini-2.5-pro`**, **`gemini-1.5-flash`** | Judge default: **`gemini-2.5-flash`** (`FREE_JUDGE_MODEL_ID`) — must stay **out** of the three candidates. |
| **OpenRouter** | Default third slug: **`google/gemini-2.5-flash`**; default judge: **`google/gemini-2.5-pro`** | OpenRouter IDs differ from raw Google names — verify slugs on [openrouter.ai/models](https://openrouter.ai/models). |

Rough **display-only** cost keys for reports live in `MODEL_COST_RATES_USD_PER_1M` in `app/eval/types.ts`; refresh those numbers when Google’s list pricing changes.

---

## OpenRouter vs Google direct

- **Google AI Studio / Gemini API** uses strings like `gemini-2.5-pro`.
- **OpenRouter** uses slugs like `google/gemini-2.5-flash`. A 404 usually means the slug is wrong for OpenRouter’s catalog, not that Google lacks the model.
