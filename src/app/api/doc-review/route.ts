import { NextRequest, NextResponse } from 'next/server';
import { createLegalAgent } from '@/lib/ai/agents/legal-agent';
import { aiIpRateLimiter, aiRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const identifier = `ai:doc-review:${getIdentifier(undefined, ip)}`;
    const userLimit = await rateLimit(aiRateLimiter, identifier, 10, 60 * 1000);
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many document review requests. Please try again later.');
    }
    if (ip) {
      const ipLimit = await rateLimit(aiIpRateLimiter, `ai:doc-review:ip:${ip}`, 60, 10 * 60 * 1000);
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many document review requests from this network. Please try again later.');
      }
    }

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
