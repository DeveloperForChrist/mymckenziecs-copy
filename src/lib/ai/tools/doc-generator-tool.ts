import { Tool } from "@langchain/core/tools";
import openaiClient from '../providers/openai-client';

export class DocGeneratorTool extends Tool {
  name = "document_generator";
  description = "A document generator that creates legal documents for UK litigation based on user inputs and legal standards. Use this when the user asks to generate, create, or draft a legal document.";

  async _call(input: string): Promise<string> {
    try {
      console.log("🔍 Analyzing document request with AI...");
      
      // Create a detailed prompt for UK legal document generation
      const prompt = `You are a UK legal document expert. Based on the user's request: "${input}"

ROLE AND SAFETY:
- Act as a meticulous legal assistant with a fact-checker mandate.
- Do not invent statute names, section numbers, or procedural rules.
- If you are unsure about a section number or wording, omit it or mark it as "[Section to verify]" rather than guessing.

SEARCH-FIRST REQUIREMENT:
- Before citing any statute, rule, practice direction, or section number, you must rely on official sources and include a link in the Source List.
- If you cannot verify a source, do not cite it.

WORKFLOW OUTPUT (plain text only, no markdown, no divider lines):
1) RELEVANT ISSUES: List the key legal issues or breaches relevant to the user's facts (short, plain English).
2) VERIFIED SOURCES: List each statute/rule you will rely on, with the exact title and a usable official URL from the approved sources (legislation.gov.uk, justice.gov.uk, caselaw.nationalarchives.gov.uk, parliament.uk, bailii.org, judiciary.uk, supremecourt.uk, gov.uk, citizensadvice.org.uk, advicenow.org.uk, lawworks.org.uk). If none, write "No statutory citations used."
3) DRAFT DOCUMENT: Produce the full draft.

DRAFTING RULES:
- Identify the document type requested (witness statement, defence, letter before action, etc.).
- Use UK-appropriate structure and terminology.
- Include placeholder fields in [SQUARE BRACKETS] for user-specific details.
- Use clear headings in plain text (e.g., INTRODUCTION, BACKGROUND, FACTS).
- Keep it professional and court-ready.

SOURCE LIST (mandatory at the end):
- After the draft, add a "SOURCE LIST" section.
- Every statute/rule/section cited must appear here with its official URL.
- Do not include any sources you did not cite in the draft.

Generate the complete response now.`;

      const completion = await openaiClient.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
        temperature: 0.7,
        max_tokens: 2000
      });
      return completion.choices[0]?.message?.content || "Failed to generate document.";
    } catch (error: any) {
      if (error.message?.includes('rate limit') || error.status === 429) {
        return "⚠️ Rate limit exceeded. Please wait a minute and try again, or upgrade your API plan for higher limits.";
      }
      console.error('Doc generator error:', error);
      throw error;
    }
  }
}
