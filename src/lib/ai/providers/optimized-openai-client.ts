/**
 * Optimized OpenAI Provider
 * Uses dynamic imports to reduce bundle size
 */

let openaiClient: any = null

export async function getOpenAIClient() {
  if (openaiClient) return openaiClient

  // Dynamic import only when needed
  const { default: OpenAI } = await import('openai')
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not defined')
  }

  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openaiClient
}

export default getOpenAIClient
