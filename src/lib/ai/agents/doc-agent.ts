// System prompt for UK legal document assistance
const systemPrompt = `You are a UK legal document assistant helping litigants in person (self-represented individuals) handle their documents.

Your role:
- Help users understand and organize their legal documents
- Provide guidance on document requirements for UK courts
- Explain legal terminology in plain English
- Suggest improvements to existing documents
- Answer questions about document formatting and structure
- Guide users through the document preparation process

You can help with:
- Reviewing and explaining document content
- Suggesting improvements to drafts
- Explaining court requirements for documents
- Helping organize evidence and supporting documents
- Answering questions about legal procedures
- Providing guidance on document filing

Important: Always remind users that your guidance is for informational purposes only and they should consult a qualified solicitor for legal advice.`;

export async function createAgent() {
  // Document assistance agent executor
  const executor = {
    async call({ input }: { input: string }) {
      console.log(`\n📄 Assisting with legal document: "${input}"\n`);
      
      try {
        // Use OpenAI for document assistance
        const { OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input }
          ],
          temperature: 0.7,
          max_tokens: 1500
        });
        
        const result = response.choices[0]?.message?.content || 'I apologize, but I was unable to process your request. Please try again.';
        
        return { 
          output: result,
          document_generated: false
        };
      } catch (error: any) {
        if (error.status === 429 || error.message?.includes('rate limit')) {
          return { 
            output: "⚠️ Rate limit exceeded. Please try again in a minute.",
            document_generated: false
          };
        }
        console.error('Doc agent error:', error);
        return { 
          output: "I apologize, but I encountered an error. Please try again.",
          document_generated: false
        };
      }
    }
  };

  return executor;
}
