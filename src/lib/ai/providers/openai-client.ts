import OpenAI from 'openai'

let cachedOpenAIClient: OpenAI | null = null

const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not defined')
  }

  cachedOpenAIClient ??= new OpenAI({ apiKey })
  return cachedOpenAIClient
}

const openaiClient = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getOpenAIClient(), prop, receiver)
  },
})

export default openaiClient
