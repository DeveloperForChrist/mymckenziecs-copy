import OpenAI from 'openai';

// Types for better type safety
export interface CaseData {
  title: string;
  citation: string;
  summary: string;
  extracts: string[];
  court: string;
  year: number;
  outcome: string;
  url: string;
}

export interface CaseStudyResult {
  content: string;
  metadata: {
    generatedAt: Date;
    model: string;
    wordCount: number;
    sections: string[];
  };
}

export interface CaseStudyError extends Error {
  code?: string;
  retryable?: boolean;
}

// Case Study System Prompt - Educational Focus
const CASE_STUDY_SYSTEM_PROMPT: string = `
You are a Law Professor providing detailed educational case studies to help litigants in person understand UK case law.

Your role is to TEACH and EXPLAIN, not to give legal advice. You are helping users learn from past cases to understand legal principles, court reasoning, and how legal arguments are structured.

EDUCATIONAL APPROACH:
1. Explain the case in detail as if teaching a law student
2. Analyze strengths and weaknesses of both parties' positions
3. Break down the court's reasoning and legal principles applied
4. Discuss what each party did well and what they could have done better
5. Explain the broader legal implications and precedents set
6. Provide learning points that help users understand legal strategy

IMPORTANT: USE PLAIN TEXT FORMAT ONLY
- Use numbered lists for sections (1., 2., 3., etc.)
- Use bullet points with hyphens (-) for sub-points
- Use regular paragraphs for explanations
- Use ALL CAPS for main headings
- No markdown formatting, no asterisks, no hashtags
- Use simple text formatting that displays cleanly

CONTENT REQUIREMENTS:
- Case Summary: 1000-2000 words (detailed case narrative)
- Total Content: Minimum 3000 words
- Be comprehensive and detailed in analysis
- Provide thorough educational content

STRUCTURE YOUR RESPONSE:

CASE SUMMARY (1000-2000 words)
Provide a comprehensive narrative of the case including:
- Complete background and context
- Detailed factual circumstances
- Full procedural history
- All legal issues presented
- Complete arguments of both parties
- Court's detailed analysis and reasoning
- Full judgment and outcome
- Post-judgment developments if any

1. CASE OVERVIEW
   - Background facts and circumstances
   - Legal issues involved in the dispute
   - Positions of both parties
   - Court where the case was heard

2. LEGAL PRINCIPLES EXPLAINED
   - Relevant laws and statutes in simple terms
   - Legal tests applied by the court
   - Key legal concepts in plain English
   - How these principles apply to the case

3. PARTY ANALYSIS - CLAIMANT/PETITIONER
   - Strengths of their legal arguments
   - Weaknesses in their case presentation
   - What they did well in court
   - What they could have improved
   - Legal strategies they used effectively

4. PARTY ANALYSIS - DEFENDANT/RESPONDENT
   - Strengths of their legal arguments
   - Weaknesses in their case presentation
   - What they did well in court
   - What they could have improved
   - Legal strategies they used effectively

5. COURT'S REASONING
   - How the judge reached their decision
   - Key factors that influenced the outcome
   - Legal tests and precedents applied
   - Policy considerations mentioned

6. LEARNING POINTS FOR LITIGANTS IN PERSON
   - What this case teaches about legal arguments
   - How to structure similar cases effectively
   - Common pitfalls to avoid in court
   - Effective legal strategies to consider
   - Evidence presentation tips and techniques

7. BROADER IMPLICATIONS
   - How this case affects similar future cases
   - Precedent value and legal significance
   - Impact on legal practice and procedure

IMPORTANT GUIDELINES:
- Use clear, accessible language but maintain legal accuracy
- Explain legal terms in simple English
- Focus on educational value, not specific advice
- Provide detailed, comprehensive explanations
- Use examples to illustrate legal concepts
- Emphasize learning and understanding
- Do not suggest specific actions for user's case
- Frame everything as educational content
- Use plain text formatting only

Your goal is to help users become better educated about legal processes and reasoning through detailed case insights.
`;

// Case Study Agent Class
export class CaseStudyAgent {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate a comprehensive case study with enhanced error handling and retry logic
   * @param caseData - The case data to analyze
   * @param options - Optional configuration for generation
   * @returns Promise resolving to case study result
   */
  async generateCaseStudy(
    caseData: CaseData,
    options: { maxRetries?: number; timeout?: number } = {}
  ): Promise<CaseStudyResult> {
    const maxRetries = options.maxRetries ?? 3;
    const timeout = options.timeout ?? 90000; // 90 seconds
    let lastError: CaseStudyError | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🎓 Generating case study for: ${caseData.title} (attempt ${attempt}/${maxRetries})`);

        const prompt = this.buildCaseStudyPrompt(caseData);
        
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            const error = new Error('Case study generation timed out') as CaseStudyError;
            error.code = 'TIMEOUT';
            error.retryable = true;
            reject(error);
          }, timeout);
        });

        // Race between API call and timeout
        const response = await Promise.race([
          this.client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: `${CASE_STUDY_SYSTEM_PROMPT}\n\n${prompt}`
              }
            ],
            temperature: 0.1,
            max_tokens: 4000
          }),
          timeoutPromise
        ]);

        const studyContent = response.choices[0]?.message?.content || '';
        
        if (!studyContent.trim()) {
          const error = new Error('Empty response from AI model') as CaseStudyError;
          error.code = 'EMPTY_RESPONSE';
          error.retryable = true;
          throw error;
        }

        // Validate minimum content length (at least 1000 words)
        const wordCount = studyContent.split(/\s+/).length;
        if (wordCount < 1000) {
          console.warn(`⚠️ Generated content is shorter than expected (${wordCount} words)`);
        }

        // Extract sections for metadata
        const sections = this.extractSections(studyContent);

        console.log(`✅ Case study generated successfully (${wordCount} words, ${sections.length} sections)`);
        
        return {
          content: studyContent,
          metadata: {
            generatedAt: new Date(),
            model: 'gpt-4o-mini',
            wordCount,
            sections
          }
        };

      } catch (error) {
        lastError = error as CaseStudyError;
        console.error(`❌ Error generating case study (attempt ${attempt}/${maxRetries}):`, error);
        
        // Check if error is retryable
        const isRetryable = lastError.retryable || 
          lastError.code === 'ECONNRESET' || 
          lastError.code === 'ETIMEDOUT' ||
          (error as any).status === 429 || // Rate limit
          (error as any).status >= 500; // Server errors

        // If this is the last attempt or error is not retryable, break
        if (attempt === maxRetries || !isRetryable) {
          break;
        }

        // Exponential backoff before retry
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries failed, return fallback
    console.warn('⚠️ All retry attempts failed, using fallback content');
    const fallbackContent = this.generateFallbackStudy(caseData);
    return {
      content: fallbackContent,
      metadata: {
        generatedAt: new Date(),
        model: 'fallback',
        wordCount: fallbackContent.split(/\s+/).length,
        sections: ['CASE STUDY', 'AVAILABLE INFORMATION', 'RECOMMENDATION']
      }
    };
  }

  /**
   * Extract section headings from generated content
   * @param content - The case study content
   * @returns Array of section names
   */
  private extractSections(content: string): string[] {
    const sections: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Match all-caps headings or numbered sections
      if (/^[A-Z][A-Z\s]+$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 50) {
        sections.push(trimmed);
      } else if (/^\d+\.\s+[A-Z]/.test(trimmed)) {
        sections.push(trimmed);
      }
    }
    
    return sections;
  }

  /**
   * Build a comprehensive prompt for case study generation with validation
   * @param caseData - The case data
   * @returns Formatted prompt string
   */
  private buildCaseStudyPrompt(caseData: CaseData): string {
    // Validate required fields
    if (!caseData.title || !caseData.citation || !caseData.summary) {
      throw new Error('Missing required case data fields');
    }

    // Sanitize and truncate extracts if too long
    const maxExtractLength = 3000;
    const sanitizedExtracts = (caseData.extracts || [])
      .filter(extract => extract && extract.trim().length > 0)
      .map(extract => extract.substring(0, maxExtractLength))
      .slice(0, 5); // Maximum 5 extracts

    const extractsSection = sanitizedExtracts.length > 0 
      ? `KEY EXTRACTS:\n${sanitizedExtracts.join('\n\n')}` 
      : 'KEY EXTRACTS:\n(No extracts available - please analyze based on the summary provided)';

    return `
Please provide a comprehensive educational case study analysis for the following UK case law:

CASE DETAILS:
Title: ${caseData.title}
Citation: ${caseData.citation}
Court: ${caseData.court || 'Not specified'}
Year: ${caseData.year || 'Not specified'}
Outcome: ${caseData.outcome || 'Not specified'}
URL: ${caseData.url || 'Not available'}

SUMMARY:
${caseData.summary.substring(0, 5000)}

${extractsSection}

IMPORTANT REQUIREMENTS:
1. Start with a detailed CASE SUMMARY of 1000-2000 words that tells the complete story of the case
2. Follow with ALL structured analysis sections as specified in your instructions
3. Total content must be minimum 3000 words for comprehensive educational value
4. Be extremely detailed and thorough in your analysis
5. Use plain text formatting only (no markdown, no asterisks)
6. Focus on practical educational value for litigants in person

FOCUS AREAS FOR ANALYSIS:
1. The complete narrative story of this case (1000-2000 word detailed summary)
2. The court's reasoning process and decision-making factors
3. Strengths and weaknesses of BOTH parties' legal positions
4. The legal principles, tests, and precedents that were applied
5. Practical lessons and strategies that can be learned
6. Common pitfalls to avoid based on this case
7. The broader legal implications and precedent value

REMEMBER:
- This is educational content, not legal advice
- Explain technical terms in plain English
- Provide specific examples from the case
- Help readers understand WHY decisions were made
- Focus on building legal literacy and understanding

Make this extremely detailed and comprehensive - think of it as a university-level law lecture that needs to provide substantial educational value. The reader should come away with a deep understanding of legal reasoning and strategy.
`;
  }

  /**
   * Generate a fallback study when AI generation fails
   * @param caseData - The case data
   * @returns Formatted fallback content
   */
  private generateFallbackStudy(caseData: CaseData): string {
    const hasExtracts = caseData.extracts && caseData.extracts.length > 0;
    const extractsSection = hasExtracts 
      ? `\n\nKEY EXTRACTS:\n${caseData.extracts.slice(0, 2).join('\n\n')}` 
      : '';

    return `
CASE STUDY: ${caseData.title}

NOTE: This is a basic overview generated from available data. For a comprehensive analysis, please try again or view the full case judgment.

1. CASE OVERVIEW

Case Citation: ${caseData.citation}
Court: ${caseData.court || 'Not specified'}
Year: ${caseData.year || 'Not specified'}
Outcome: ${caseData.outcome || 'Not specified'}

This ${caseData.court || 'UK'} case from ${caseData.year || 'the specified year'} provides important legal precedent. The case resulted in ${caseData.outcome || 'a judicial decision'}.

2. CASE SUMMARY

${caseData.summary}${extractsSection}

3. WHY THIS CASE MATTERS

Case law provides crucial guidance for litigants in person by:
- Demonstrating how courts apply legal principles in practice
- Showing what types of arguments and evidence are persuasive
- Illustrating proper court procedure and presentation
- Establishing precedents that may apply to your situation

4. HOW TO STUDY THIS CASE EFFECTIVELY

To get maximum educational benefit from this case:

a) Read the Full Judgment
   - Access the complete case at: ${caseData.url || 'the court website'}
   - Take notes on key legal principles mentioned
   - Pay attention to the court's reasoning process

b) Analyze the Parties' Arguments
   - What legal arguments did each party make?
   - What evidence did they present?
   - Which arguments were successful and why?
   - What could have been done differently?

c) Identify Legal Principles
   - What laws, statutes, or regulations were cited?
   - What previous cases (precedents) were referenced?
   - What legal tests or standards were applied?
   - How did the judge interpret and apply the law?

d) Extract Practical Lessons
   - What does this teach about preparing your case?
   - What evidence seems most important to judges?
   - How should arguments be structured?
   - What mistakes should be avoided?

5. IMPORTANT REMINDERS FOR LITIGANTS IN PERSON

- Every case is unique - precedents guide but don't dictate outcomes
- Focus on understanding legal reasoning, not just outcomes
- Good preparation and clear evidence presentation matter greatly
- Consider seeking legal advice for complex matters
- Courts expect proper procedure and respectful conduct
- Document everything and meet all deadlines

6. NEXT STEPS

After studying this case:
1. Review the full judgment carefully
2. Note any similarities to your situation
3. Research any legal principles or statutes mentioned
4. Consider how the lessons might apply to your case
5. Seek professional legal advice if needed

REMEMBER: This is educational material only, not legal advice. Always verify legal principles with current law and seek professional guidance for your specific situation.

For the complete case insights, visit: ${caseData.url || 'the relevant court database'}
`;
  }
}

// Export singleton instance
export const caseStudyAgent = new CaseStudyAgent();
