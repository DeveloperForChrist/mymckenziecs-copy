import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not defined')
}

const openaiClient = new OpenAI({ apiKey })

export default openaiClient
