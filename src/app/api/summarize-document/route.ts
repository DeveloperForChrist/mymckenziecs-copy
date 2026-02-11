import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { aiRateLimiter, rateLimit, getIdentifier } from '@/lib/utils/rate-limit';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { getPlanFeatures } from '@/lib/featureGating';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  let userId: string | null = null;

  try {
    // Get user session for rate limiting and plan checking
    const supabaseAuth = await createSupabaseRouteClient();
    const { data: authData } = await supabaseAuth.auth.getUser();
    userId = authData?.user?.id || null;
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    
    // Check user's plan for document analysis access
    if (userId) {
      const { data: profile } = await supabaseAuth
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .single();
      
      const userPlan = profile?.plan || 'freemium';
      const planFeatures = getPlanFeatures(userPlan);
      
      // Document summarization is available for all plans (including freemium)
      // but we can add rate limiting based on plan if needed
    } else {
      // Non-authenticated users don't have access to document summarization
      return NextResponse.json(
        { 
          error: 'Authentication required',
          message: 'Please sign in to access document summarization.',
        },
        { status: 401 }
      );
    }
    
    // Apply rate limiting (5 requests per 60 seconds for summarization)
    const identifier = getIdentifier(userId, ip || undefined)
    const rateLimitResult = await rateLimit(aiRateLimiter, identifier, 5, 60000)
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Too many requests',
          message: 'You have exceeded the rate limit for document summarization. Please try again later.',
          resetAt: new Date(rateLimitResult.reset).toISOString()
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': String(rateLimitResult.reset),
          }
        }
      )
    }

    const body = await request.json();
    const { title, content } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Document content is required' },
        { status: 400 }
      );
    }

    // Truncate content if too long (OpenAI has token limits)
    const maxContentLength = 15000; // Rough estimate for token limits
    const truncatedContent = content.length > maxContentLength 
      ? content.substring(0, maxContentLength) + "..." 
      : content;

    // Generate summary using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that summarizes legal documents. Your task is to:

1. Extract and present the key points and main ideas from the document
2. Identify important dates, names, and factual information
3. Highlight any action items or deadlines mentioned
4. Provide a clear, concise summary that helps the user understand the document's content

IMPORTANT: You are providing a document summary ONLY. Do not provide legal advice, opinions, or recommendations about what the user should do. Simply summarize what the document contains.

Format your response with clear headings and bullet points for easy reading.`
        },
        {
          role: "user",
          content: `Please summarize this document titled "${title}":

${truncatedContent}`
        }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const summary = completion.choices[0]?.message?.content || 'No summary generated';

    return NextResponse.json({
      summary,
      title,
      contentLength: content.length,
      truncated: content.length > maxContentLength
    });

  } catch (error: any) {
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        api: 'summarize-document',
        userId: userId,
      },
      contexts: {
        request: {
          url: request.url,
          method: request.method,
        }
      }
    })

    console.error('Document summarization error:', error);
    return NextResponse.json(
      { error: 'Failed to summarize document', details: error.message },
      { status: 500 }
    );
  }
}
