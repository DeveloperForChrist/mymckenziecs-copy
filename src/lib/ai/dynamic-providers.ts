/**
 * Dynamic AI Provider Loader
 * Loads AI providers only when needed to reduce bundle size
 */

type AIProvider = 'openai'

interface AIProviderConfig {
  name: string
  apiKey: string
  client: any
}

const loadedProviders = new Map<AIProvider, AIProviderConfig>()

/**
 * Dynamically load an AI provider
 */
export async function loadAIProvider(provider: AIProvider): Promise<AIProviderConfig> {
  // Return cached provider if already loaded
  if (loadedProviders.has(provider)) {
    return loadedProviders.get(provider)!
  }

  let config: AIProviderConfig

  switch (provider) {
    case 'openai':
      // Dynamic import of OpenAI
      const { default: OpenAI } = await import('openai')
      config = {
        name: 'OpenAI',
        apiKey: process.env.OPENAI_API_KEY!,
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      }
      break

      default:
        throw new Error(`Unsupported AI provider: ${provider}`)
  }

  // Cache the loaded provider
  loadedProviders.set(provider, config)
  return config
}

/**
 * Get available AI providers (based on API keys)
 */
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = []
  
  if (process.env.OPENAI_API_KEY) providers.push('openai')
  
  return providers
}

/**
 * Check if a provider is available
 */
export function isProviderAvailable(provider: AIProvider): boolean {
  switch (provider) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY
    default:
      return false
  }
}
