/**
 * Unified AI Client
 * Provides a single interface for multiple AI providers
 */

import { loadAIProvider, getAvailableProviders, isProviderAvailable } from './dynamic-providers'

export type AIProvider = 'openai'

export interface AIResponse {
  content: string
  provider: AIProvider
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface AIConfig {
  model?: string
  temperature?: number
  maxTokens?: number
  provider?: AIProvider
}

/**
 * Unified AI Client Class
 */
export class UnifiedAIClient {
  private defaultProvider: AIProvider
  private fallbackProvider: AIProvider

  constructor(defaultProvider: AIProvider = 'openai', fallbackProvider: AIProvider = 'openai') {
    this.defaultProvider = defaultProvider
    this.fallbackProvider = fallbackProvider
  }

  /**
   * Generate completion using available AI provider
   */
  async generateCompletion(
    prompt: string,
    config: AIConfig = {}
  ): Promise<AIResponse> {
    const provider = this.selectBestProvider(config.provider)
    
    try {
      const providerConfig = await loadAIProvider(provider)
      return await this.generateWithProvider(providerConfig, prompt, config)
    } catch (error) {
      console.error(`Error with ${provider} provider:`, error)
      
      // Try fallback provider
      if (provider !== this.fallbackProvider && isProviderAvailable(this.fallbackProvider)) {
        const fallbackConfig = await loadAIProvider(this.fallbackProvider)
        return await this.generateWithProvider(fallbackConfig, prompt, config)
      }
      
      throw error
    }
  }

  /**
   * Generate streaming completion
   */
  async *generateCompletionStream(
    prompt: string,
    config: AIConfig = {}
  ): AsyncGenerator<string, void, unknown> {
    const provider = this.selectBestProvider(config.provider)
    
    try {
      const providerConfig = await loadAIProvider(provider)
      yield* this.generateWithProviderStream(providerConfig, prompt, config)
    } catch (error) {
      console.error(`Error with ${provider} provider:`, error)
      
      // Try fallback provider
      if (provider !== this.fallbackProvider && isProviderAvailable(this.fallbackProvider)) {
        const fallbackConfig = await loadAIProvider(this.fallbackProvider)
        yield* this.generateWithProviderStream(fallbackConfig, prompt, config)
      }
      
      throw error
    }
  }

  /**
   * Select the best available provider
   */
  private selectBestProvider(preferred?: AIProvider): AIProvider {
    if (preferred && isProviderAvailable(preferred)) {
      return preferred
    }

    if (isProviderAvailable(this.defaultProvider)) {
      return this.defaultProvider
    }

    const available = getAvailableProviders()
    if (available.length === 0) {
      throw new Error('No AI providers available. Check your API keys.')
    }

    return available[0]
  }

  /**
   * Generate completion with specific provider
   */
  private async generateWithProvider(
    providerConfig: any,
    prompt: string,
    config: AIConfig
  ): Promise<AIResponse> {
    const model = config.model || this.getDefaultModel(providerConfig.name)
    const temperature = config.temperature ?? 0.7
    const maxTokens = config.maxTokens ?? 1000

    let response: any

    switch (providerConfig.name) {
      case 'OpenAI':
        response = await providerConfig.client.chat.completions.create({
          model: model || 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxTokens,
        })
        return {
          content: response.choices[0]?.message?.content || '',
          provider: 'openai',
          usage: response.usage ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens
          } : undefined
        }

      default:
        throw new Error(`Provider ${providerConfig.name} not implemented`)
    }
  }

  /**
   * Generate streaming completion with specific provider
   */
  private async *generateWithProviderStream(
    providerConfig: any,
    prompt: string,
    config: AIConfig
  ): AsyncGenerator<string, void, unknown> {
    const model = config.model || this.getDefaultModel(providerConfig.name)
    const temperature = config.temperature ?? 0.7
    const maxTokens = config.maxTokens ?? 1000

    switch (providerConfig.name) {
      case 'OpenAI':
        const stream = await providerConfig.client.chat.completions.create({
          model: model || 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxTokens,
          stream: true,
        })

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || ''
          if (content) yield content
        }
        break

      default:
        throw new Error(`Streaming not implemented for ${providerConfig.name}`)
    }
  }

  /**
   * Get default model for provider
   */
  private getDefaultModel(providerName: string): string {
    switch (providerName) {
      case 'OpenAI':
        return 'gpt-4'
      default:
        return 'gpt-4'
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): AIProvider[] {
    return getAvailableProviders()
  }

  /**
   * Check if provider is available
   */
  isProviderAvailable(provider: AIProvider): boolean {
    return isProviderAvailable(provider)
  }
}

// Create default instance
export const aiClient = new UnifiedAIClient('openai', 'openai')
