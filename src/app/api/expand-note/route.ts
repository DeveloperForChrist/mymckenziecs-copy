import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPrompt = `You are a UK legal assistant helping litigants in person (self-represented individuals) expand and enrich their case notes.

Your role is to:
- Take the user's existing note content and expand on it with relevant legal knowledge, facts, and practical information
- Add helpful context about UK court procedures, legal concepts, and best practices
- Provide actionable advice and important considerations
- Keep the tone supportive and accessible for non-lawyers
- Focus on UK law and court procedures

Guidelines:
- Build upon what the user has already written - don't replace it
- Add relevant legal context, definitions, and explanations
- Include practical tips and things to remember
- Mention relevant court rules or procedures where applicable
- Keep language clear and jargon-free
- Be encouraging and supportive
- Format with clear headings and bullet points for readability

Important: You are helping someone represent themselves in court. Be thorough but accessible.`;

export async function POST(request: NextRequest) {
  try {
    const { noteTitle, noteContent } = await request.json();

    if (!noteContent || noteContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'Note content is required to expand upon' },
        { status: 400 }
      );
    }

    const userMessage = `Please expand on the following note with additional legal knowledge, facts, and practical information for a litigant in person in the UK:

Note Title: ${noteTitle || 'Untitled'}

Current Note Content:
${noteContent}

Please add relevant information, context, and practical tips that would help someone representing themselves understand this topic better. Build upon what they've written - don't replace it.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const expandedContent = completion.choices[0]?.message?.content || '';

    return NextResponse.json({
      expandedContent,
      success: true
    });
  } catch (error: unknown) {
    console.error('Expand note error:', error);

    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: number }).status)
        : undefined;
    const errorMessage = error instanceof Error ? error.message : '';

    if (status === 429 || errorMessage.includes('rate limit')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to expand note. Please try again.' },
      { status: 500 }
    );
  }
}
