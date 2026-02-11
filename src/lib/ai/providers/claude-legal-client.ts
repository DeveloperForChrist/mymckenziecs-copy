import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY

if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY is not defined')
}

const claudeLegalClient = new Anthropic({ apiKey })

export default claudeLegalClient
