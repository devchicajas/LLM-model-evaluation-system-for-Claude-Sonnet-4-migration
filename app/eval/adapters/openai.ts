import OpenAI from 'openai'
import type { ModelAdapter } from '../types.js'

export function createOpenAiGpt4oMiniAdapter(apiKey: string): ModelAdapter {
  const client = new OpenAI({ apiKey })

  return {
    modelId: 'gpt-4o-mini',
    async generate(prompt: string) {
      const started = Date.now()
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
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
