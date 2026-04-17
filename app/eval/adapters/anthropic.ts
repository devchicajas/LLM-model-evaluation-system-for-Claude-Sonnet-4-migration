import Anthropic from '@anthropic-ai/sdk'
import type { ModelAdapter } from '../types.js'

export function createAnthropicMessagesAdapter(apiKey: string, model: string): ModelAdapter {
  const client = new Anthropic({ apiKey })

  return {
    modelId: model,
    async generate(prompt: string) {
      const started = Date.now()
      const msg = await client.messages.create({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      })
      const latencyMs = Date.now() - started
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      return {
        text,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        latencyMs,
      }
    },
  }
}

export function createAnthropicClaude35SonnetAdapter(apiKey: string): ModelAdapter {
  return createAnthropicMessagesAdapter(apiKey, 'claude-3-5-sonnet-20241022')
}
