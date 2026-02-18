import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { OpenAI } from 'openai';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { question, caseTitle, citation, summary, extracts, studyText, court, year, outcome, url } = body || {};
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    let sourceExcerpt: string | null = null;
    if (url && typeof url === 'string') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const html = await response.text();
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (text) {
            sourceExcerpt = text.slice(0, 6000);
          }
        }
      } catch {
        sourceExcerpt = null;
      }
    }

    const context = [
      caseTitle ? `Case title: ${caseTitle}` : null,
      citation ? `Citation: ${citation}` : null,
      summary ? `Summary: ${summary}` : null,
      court ? `Court: ${court}` : null,
      year ? `Year: ${year}` : null,
      outcome ? `Outcome: ${outcome}` : null,
      url ? `Source: ${url}` : null,
      sourceExcerpt ? `Source text excerpt: ${sourceExcerpt}` : null,
      Array.isArray(extracts) && extracts.length ? `Key extracts: ${extracts.join('\n')}` : null,
      studyText ? `Study notes: ${studyText}` : null,
    ].filter(Boolean).join('\n\n');

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an educational legal study assistant for UK case law writing for non-lawyers. Answer clearly and concisely in plain English, assuming the user has no legal background. Explain legal terms in simple words when used. Use plain text only (no markdown, no bullets). Do not provide legal advice, recommendations, or instructions. Do not tell the user what they should, must, or need to do in their own case. Keep answers educational and case-explanatory only. If the question is outside the case details provided, say you do not have enough information.'
        },
        {
          role: 'user',
          content: `${context}\n\nQuestion: ${question}`
        }
      ],
      temperature: 0.2,
      max_tokens: 600
    });

    const sanitizePlainText = (text: string) =>
      text
        .replace(/```([\s\S]*?)```/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/#+\s*/g, '')
        .replace(/^\s*>+\s?/gm, '')
        .replace(/^\s*[-*]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .trim();

    const enforceEducationalOnlyLanguage = (text: string) =>
      text
        .replace(/\b(I|we)\s+recommend\b/gi, 'A common approach in similar cases is')
        .replace(/\byou\s+should\b/gi, 'it may be useful to understand that')
        .replace(/\byou\s+must\b/gi, 'courts generally require that')
        .replace(/\byou\s+need\s+to\b/gi, 'it is important to understand that')
        .replace(/\bmy\s+advice\s+is\b/gi, 'an educational point is')
        .replace(/\bI\s+advise\b/gi, 'this case indicates')
        .replace(/\s{2,}/g, ' ')
        .trim();

    const EDUCATIONAL_FOOTER = 'Educational information only — not legal advice.';

    const appendEducationalFooter = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return EDUCATIONAL_FOOTER;
      if (trimmed.toLowerCase().includes('not legal advice')) return trimmed;
      return `${trimmed}\n\n${EDUCATIONAL_FOOTER}`;
    };

    const rawAnswer = completion.choices?.[0]?.message?.content?.trim() || '';
    const answer = rawAnswer
      ? appendEducationalFooter(enforceEducationalOnlyLanguage(sanitizePlainText(rawAnswer)))
      : 'Sorry, I could not generate an answer.';
    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('Case study chat error:', error);
    return NextResponse.json({ error: 'Failed to answer question' }, { status: 500 });
  }
}
