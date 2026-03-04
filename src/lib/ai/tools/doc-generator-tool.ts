import { Tool } from "@langchain/core/tools";
import openaiClient from '../providers/openai-client';

export class DocGeneratorTool extends Tool {
  name = "document_generator";
  description = "A template filler for UK litigation documents. Only fills approved template-style structures with placeholders. Never writes bespoke/personalized letters or drafts.";

  private isTemplateFillIntent(input: string): boolean {
    const text = (input || '').toLowerCase()
    if (!text.trim()) return false

    const mentionsTemplateOrForm =
      /\b(template|pro forma|standard form|form|n1|n9|n180|n244|witness statement template|letter template)\b/.test(text)
    const fillVerb =
      /\b(fill|populate|complete|slot in|insert|use template|template fill)\b/.test(text)

    return mentionsTemplateOrForm || fillVerb
  }

  private enforceTemplateOnlyOutput(output: string): string {
    const text = (output || '').trim()
    if (!text) {
      return "I can only help with template-based document filling. Please provide a template type and key fields to fill."
    }

    const hasPlaceholder = /\[[^\]\n]{2,80}\]/.test(text)
    const looksPersonalizedLetter =
      /\bdear\s+(mr|mrs|ms|sir|madam|[a-z])/i.test(text) ||
      /\byours\s+(sincerely|faithfully)\b/i.test(text)

    if (!hasPlaceholder || looksPersonalizedLetter) {
      return "I cannot produce bespoke or personalised letters. I can fill template documents only, using placeholders like [CLAIMANT NAME], [DATE], and [REFERENCE]."
    }

    return text
  }

  async _call(input: string): Promise<string> {
    try {
      console.log("🔍 Analyzing document request with AI...");

      if (!this.isTemplateFillIntent(input)) {
        return "I cannot produce bespoke or personalised letters. I can help fill template documents only. Please name the template/form and the fields you want filled."
      }
      
      const prompt = `You are a UK legal template assistant. Based on the user's request: "${input}"

ROLE AND SAFETY:
- You must NEVER produce bespoke/personalised letters or custom advocacy drafts.
- You may ONLY output template-fill content.
- Keep user-specific items as placeholders in [SQUARE BRACKETS].
- If a detail is missing, keep a placeholder; do not invent.
- Do not include addresses, names, signatures, or salutations unless represented as placeholders.

OUTPUT FORMAT (plain text only, no markdown):
1) TEMPLATE TYPE: one short line
2) TEMPLATE FIELDS NEEDED: bullet list of placeholders
3) TEMPLATE DRAFT: structured template text with placeholders
4) CHECKLIST: short list of what the user should provide to complete placeholders

Generate template-fill output only.`

      const completion = await openaiClient.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
        temperature: 0.3,
        max_tokens: 1600
      });
      const raw = completion.choices[0]?.message?.content || "Failed to generate document."
      return this.enforceTemplateOnlyOutput(raw)
    } catch (error: any) {
      if (error.message?.includes('rate limit') || error.status === 429) {
        return "⚠️ Rate limit exceeded. Please wait a minute and try again, or upgrade your API plan for higher limits.";
      }
      console.error('Doc generator error:', error);
      throw error;
    }
  }
}
