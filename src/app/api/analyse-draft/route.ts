import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { aiIpRateLimiter, aiRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const identifier = `ai:analyse-draft:${getIdentifier(undefined, ip)}`;
    const userLimit = await rateLimit(aiRateLimiter, identifier, 10, 60 * 1000);
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many draft analysis requests. Please try again later.');
    }
    if (ip) {
      const ipLimit = await rateLimit(aiIpRateLimiter, `ai:analyse-draft:ip:${ip}`, 60, 10 * 60 * 1000);
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many draft analysis requests from this network. Please try again later.');
      }
    }

    const { title, content } = await req.json();

    console.log('Analyse draft request:', { title, contentLength: content?.length, content: content?.substring(0, 100) });

    if (!content || content.trim().length === 0) {
      return NextResponse.json({
        error: 'No content to analyse'
      }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a legal document analyst helping UK litigants in person (self-represented individuals).

Analyze the provided document and return a JSON object ONLY with:
{
  "analysisText": "Plaintext analysis with the headings below.",
  "highlights": [
    { "start": number, "end": number, "label": "grammar|clarity|missing_info|consistency|other", "reason": "short reason" }
  ]
}

Plaintext headings to include inside analysisText:
DOCUMENT OVERVIEW:
AREAS FOR ATTENTION:
STRENGTHS:
RECOMMENDATIONS:
NEXT STEPS:

Rules:
- analysisText must be plain text (no markdown).
- highlights refer to character offsets in the provided document Content.
- Provide up to 20 highlights. Each should target a short span (1-200 chars).
- If no clear highlights, return an empty array.
- Be specific, practical, and use clear plain English. Focus on helping someone who is representing themselves in court.`
        },
        {
          role: 'user',
          content: `Analyse this legal document:\n\nTitle: ${title || 'Untitled'}\n\nContent:\n${content.substring(0, 10000)}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const raw = response.choices[0]?.message?.content || '';
    let analysisText = 'Unable to analyse document.';
    let highlights: Array<{ start: number; end: number; label?: string; reason?: string }> = [];
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.analysisText) analysisText = parsed.analysisText;
      if (Array.isArray(parsed?.highlights)) {
        highlights = parsed.highlights
          .filter((h: any) => typeof h?.start === 'number' && typeof h?.end === 'number')
          .slice(0, 20);
      }
    } catch {
      analysisText = raw || analysisText;
    }

    return NextResponse.json({
      success: true,
      analysis: analysisText,
      analysisText,
      highlights
    });
  } catch (error: any) {
    console.error('Draft analysis error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to analyse document' },
      { status: 500 }
    );
  }
}
