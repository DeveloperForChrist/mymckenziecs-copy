import { Tool } from "@langchain/core/tools";
import openaiClient from '../providers/openai-client';

export class DocGeneratorTool extends Tool {
  name = "document_generator";
  description = "Drafts litigation documents in plain text using the user's request and conversation context. Uses placeholders only where necessary for missing facts.";

  private normalizeDraftOutput(output: string): string {
    const text = (output || '').trim()
    if (!text) {
      return "I could not generate a draft from that request. Please tell me the document type and the main facts you want included."
    }

    return text
  }

  async _call(input: string): Promise<string> {
    try {
      console.log("🔍 Analyzing document request with AI...");

      const prompt = `You are a legal document drafting assistant. Based on the user's request: "${input}"

ROLE AND SAFETY:
- Draft the specific document the user has asked for.
- Tailor the draft to the facts and context provided.
- Match the user's stated jurisdiction and terminology when it is clear from the request.
- If the jurisdiction is not clear, avoid adding jurisdiction-specific rules, court titles, or labels that were not provided.
- If a necessary factual detail is missing, use a short placeholder in [SQUARE BRACKETS].
- Do not invent names, dates, addresses, references, or factual allegations that were not provided.
- Keep the draft practical, coherent, and ready for the user to adapt.
- Plain text only. No markdown links, tables, or code fences.

OUTPUT FORMAT:
- First line: the document type or short heading if useful.
- Then provide the draft itself.
- If useful, end with a short "Missing details:" line listing only the key blanks the user may want to complete.`

      const completion = await openaiClient.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
        temperature: 0.3,
        max_tokens: 1600
      });
      const raw = completion.choices[0]?.message?.content || "Failed to generate document."
      return this.normalizeDraftOutput(raw)
    } catch (error: any) {
      if (error.message?.includes('rate limit') || error.status === 429) {
        return "⚠️ Rate limit exceeded. Please wait a minute and try again, or upgrade your API plan for higher limits.";
      }
      console.error('Doc generator error:', error);
      throw error;
    }
  }
}
