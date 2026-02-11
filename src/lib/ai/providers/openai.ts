import OpenAI from 'openai';
import { logOpenAIUsage } from '../../utils/openai-usage-logger';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not defined');
}

export const openai = new OpenAI({ apiKey });

const fallbackModels = ['gpt-4o', 'gpt-4', 'gpt-3.5-turbo'];
function getModel() {
  const envModel = process.env.OPENAI_CHAT_MODEL;
  if (envModel) return envModel;
  return fallbackModels.find(Boolean) || 'gpt-4';
}

export async function generateChatResponse(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
) {
  const model = getModel();
  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });
    // Log usage for admin panel
    void logOpenAIUsage({
      model,
      usage: response.usage,
      messages,
      timestamp: new Date().toISOString(),
      success: true,
    });
    return response.choices[0]?.message?.content || 'No response generated';
  } catch (error: any) {
    void logOpenAIUsage({
      model,
      usage: null,
      messages,
      timestamp: new Date().toISOString(),
      success: false,
      error: error?.message || String(error),
    });
    throw error;
  }
}
