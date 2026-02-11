import { NextRequest, NextResponse } from 'next/server';
import { createLegalAgent } from '@/lib/ai/agents/legal-agent';

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json();
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid content' }, { status: 400 });
    }
    const agent = await createLegalAgent();
    const result = await agent.invoke({ input: `Please review this document for court-readability, structure, clarity, and suggest improvements.\n\nDocument:\n${content}` });
    return NextResponse.json({ feedback: result.response });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process document review.' }, { status: 500 });
  }
}
