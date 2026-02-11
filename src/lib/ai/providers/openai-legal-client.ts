import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not defined')
}

const openaiLegalClient = new OpenAI({ apiKey })

export default openaiLegalClient
