import { env } from '../config/env.js';

export type NeoGenerateRequest = {
  system: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
};

export type NeoGenerateResponse = {
  text: string;
  provider: string;
  model: string;
};

export interface NeoProviderAdapter {
  generate(request: NeoGenerateRequest): Promise<NeoGenerateResponse>;
}

export class NeoProviderError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'NeoProviderError';
    this.statusCode = statusCode;
  }
}

class OpenAICompatibleAdapter implements NeoProviderAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly providerName: string,
    private readonly timeoutMs: number
  ) {}

  async generate(request: NeoGenerateRequest): Promise<NeoGenerateResponse> {
    if (!this.apiKey && this.providerName === 'openai') {
      throw new NeoProviderError('NEO_AI_API_KEY is not configured on the server.', 503);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        }),
      });

      if (!response.ok) {
        throw new NeoProviderError(`AI upstream returned HTTP ${response.status}`, response.status);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content || '';
      return { text, provider: this.providerName, model: this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}

class AnthropicAdapter implements NeoProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number
  ) {}

  async generate(request: NeoGenerateRequest): Promise<NeoGenerateResponse> {
    if (!this.apiKey) {
      throw new NeoProviderError('NEO_AI_API_KEY is not configured on the server.', 503);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        }),
      });

      if (!response.ok) {
        throw new NeoProviderError(`Anthropic upstream returned HTTP ${response.status}`, response.status);
      }

      const data = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const text =
        data.content
          ?.filter(block => block.type === 'text' && typeof block.text === 'string')
          .map(block => block.text)
          .join('') || '';
      return { text, provider: 'anthropic', model: this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}

class GeminiAdapter implements NeoProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number
  ) {}

  async generate(request: NeoGenerateRequest): Promise<NeoGenerateResponse> {
    if (!this.apiKey) {
      throw new NeoProviderError('NEO_AI_API_KEY is not configured on the server.', 503);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.model
      )}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.system }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: request.prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: request.maxTokens,
            temperature: request.temperature,
          },
        }),
      });

      if (!response.ok) {
        throw new NeoProviderError(`Gemini upstream returned HTTP ${response.status}`, response.status);
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text =
        data.candidates?.[0]?.content?.parts
          ?.map(part => part.text || '')
          .join('') || '';
      return { text, provider: 'gemini', model: this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createDefaultNeoAdapter(): NeoProviderAdapter {
  switch (env.NEO_AI_PROVIDER) {
    case 'anthropic':
      return new AnthropicAdapter(env.NEO_AI_API_KEY, env.NEO_AI_MODEL, env.NEO_AI_TIMEOUT_MS);
    case 'gemini':
      return new GeminiAdapter(env.NEO_AI_API_KEY, env.NEO_AI_MODEL, env.NEO_AI_TIMEOUT_MS);
    case 'openai-compatible':
      return new OpenAICompatibleAdapter(
        env.NEO_AI_BASE_URL || 'http://localhost:11434/v1',
        env.NEO_AI_API_KEY,
        env.NEO_AI_MODEL,
        'openai-compatible',
        env.NEO_AI_TIMEOUT_MS
      );
    case 'openai':
    default:
      return new OpenAICompatibleAdapter(
        env.NEO_AI_BASE_URL || 'https://api.openai.com/v1',
        env.NEO_AI_API_KEY,
        env.NEO_AI_MODEL,
        'openai',
        env.NEO_AI_TIMEOUT_MS
      );
  }
}
