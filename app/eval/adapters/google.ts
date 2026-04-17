import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ModelAdapter } from '../types.js'

export function createGeminiGenerativeAdapter(apiKey: string, modelId: string): ModelAdapter {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelId })

  return {
    modelId,
    async generate(prompt: string) {
      const started = Date.now()
      const result = await model.generateContent(prompt)
      const latencyMs = Date.now() - started
      const text = result.response.text()
      const usage = result.response.usageMetadata
      const inputTokens = usage?.promptTokenCount ?? 0
      const outputTokens = usage?.candidatesTokenCount ?? 0
      return { text, inputTokens, outputTokens, latencyMs }
    },
  }
}

/** Direct benchmark third slot: stable Gemini 2.5 Pro (see docs/GEMINI_MODEL_LINEUP.md). */
export function createGemini25ProAdapter(apiKey: string): ModelAdapter {
  return createGeminiGenerativeAdapter(apiKey, 'gemini-2.5-pro')
}
