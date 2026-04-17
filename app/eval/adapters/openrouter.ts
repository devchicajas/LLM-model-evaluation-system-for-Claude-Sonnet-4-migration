import OpenAI from 'openai'
import type { ModelAdapter } from '../types.js'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * OpenRouter exposes an OpenAI-compatible Chat Completions API.
 * One API key can route to many providers/models via the `model` slug.
 */
export function createOpenRouterModelAdapter(
  apiKey: string,
  openRouterModelSlug: string,
): ModelAdapter {
  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://localhost',
      'X-Title': process.env.OPENROUTER_APP_TITLE?.trim() || 'llm-model-eval',
    },
  })

  return {
    modelId: openRouterModelSlug,
    async generate(prompt: string) {
      const started = Date.now()
      const completion = await client.chat.completions.create({
        model: openRouterModelSlug,
        messages: [{ role: 'user', content: prompt }],
      })
      const latencyMs = Date.now() - started
      const text = completion.choices[0]?.message?.content ?? ''
      const inputTokens = completion.usage?.prompt_tokens ?? 0
      const outputTokens = completion.usage?.completion_tokens ?? 0
      return { text, inputTokens, outputTokens, latencyMs }
    },
  }
}
