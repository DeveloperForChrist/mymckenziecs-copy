import { NextRequest, NextResponse } from 'next/server';
import { caseStudyAgent, type CaseData } from '@/lib/ai/agents/case-study-agent';
import { searchByText } from '@/lib/vector/milvus';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { aiRateLimiter, rateLimit, getIdentifier } from '@/lib/utils/rate-limit';
import OpenAI from 'openai';
import {
  paginateContent, 
  analyzeContentStatistics, 
  calculateContentQuality,
  assessEducationalValue 
} from '@/lib/utils/case-study-utils';
import { caseStudyCache } from '@/lib/cache/case-study-cache';
import { z } from 'zod';
import { captureServerException } from '@/lib/monitoring/error-logger';
import { getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { hasCaseLawAccess } from '@/lib/plans/access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const CASE_STUDY_RESPONSE_CACHE_ENABLED = false;

// Input validation schema with better validation rules
const caseStudySchema = z.object({
  title: z.string().min(5, 'Case title must be at least 5 characters').max(500, 'Title too long'),
  citation: z.string().min(3, 'Citation must be at least 3 characters').max(200, 'Citation too long'),
  summary: z.string().min(50, 'Summary must be at least 50 characters').max(10000, 'Summary too long'),
  extracts: z.array(z.string().max(5000)).optional().default([]),
  court: z.string().optional().default('Not specified'),
  year: z.number().int().min(1800).max(new Date().getFullYear() + 1).optional(),
  outcome: z.string().optional().default('Not specified'),
  url: z.string().url().optional().or(z.literal('')).default('')
}).strict();

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await getOrSyncUserEntitlementSnapshot(authData.user.id);
    const planLabel = String(snapshot?.plan_type || '');
    if (!planLabel) {
      return NextResponse.json(
        { error: 'Plan paused: case law study is locked. Resume your plan to continue.' },
        { status: 402 }
      );
    }
    if (!hasCaseLawAccess(planLabel)) {
      return NextResponse.json(
        { error: 'Case law study is available on Premium + plans.' },
        { status: 403 }
      );
    }

    // Rate limiting - 5 requests per minute
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
    const identifier = getIdentifier(authData.user.id, ip || undefined);
    const rateLimitResult = await rateLimit(aiRateLimiter, identifier, 5, 60000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: 60 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': '60'
          }
        }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = caseStudySchema.parse(body);

    console.log('🎓 Generating case study for:', validatedData.title);

    // Optional cache path is intentionally disabled to keep AI outputs always fresh.
    if (CASE_STUDY_RESPONSE_CACHE_ENABLED) {
      const cached = caseStudyCache.get(validatedData.title, validatedData.citation);
      if (cached) {
        const contentStats = analyzeContentStatistics(cached.content);
        const qualityScore = calculateContentQuality(cached.content);
        const educationalValue = assessEducationalValue(cached.content);
        const paginatedContent = paginateContent(cached.content, 500);
        const processingTime = Date.now() - startTime;

        return NextResponse.json({
          success: true,
          caseStudy: cached.content,
          paginatedContent,
          totalPages: paginatedContent.length,
          wordsPerPage: 500,
          totalWords: contentStats.wordCount,
          metadata: {
            ...cached.metadata,
            processingTimeMs: processingTime,
            isFallback: cached.metadata?.model === 'fallback',
            contentStatistics: contentStats,
            qualityScore,
            educationalValue,
            cacheHit: true
          },
          caseData: {
            title: validatedData.title,
            citation: validatedData.citation,
            court: validatedData.court,
            year: validatedData.year
          }
        });
      }
    }

    // Optionally enrich extracts using vector DB if available
    try {
      if (process.env.MILVUS_HOST) {
        const queryText = `${validatedData.title} ${validatedData.summary}`.slice(0, 4000);
        const related = await searchByText(queryText, 5);
        const relatedExtracts = (related || [])
          .map((r: any) => r.summary || (Array.isArray(r.extracts) ? r.extracts.join('\n') : null))
          .filter(Boolean);
        validatedData.extracts = Array.from(new Set([...(validatedData.extracts || []), ...relatedExtracts])).slice(0, 5);
        console.log(`🔗 Added ${relatedExtracts.length} extracts from vector DB to case study input`);
      }
    } catch (err) {
      console.error('Vector enrichment error:', err);
    }

    // Supabase fallback: if vector DB didn't provide enough extracts, try Supabase by citation/title
    try {
      const needMore = !validatedData.extracts || validatedData.extracts.length < 3;
      if (needMore && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const citation = validatedData.citation;
        const title = validatedData.title;
        let row: any = null;

        // Try a dedicated `case_law` table (if present) matching citation or title
        try {
          const { data, error } = await supabaseAdmin
            .from('case_law')
            .select('summary, extracts')
            .or(`citation.eq.${citation},title.ilike.%${title}%`)
            .limit(1);
          if (error) console.warn('Supabase case_law lookup error:', error.message || error);
          if (data && data.length) row = data[0];
        } catch (e) {
          console.warn('Supabase case_law query failed:', e);
        }

        // Fallback to `cases` table description if case_law not present
        if (!row) {
          try {
            const { data: cdata, error: cErr } = await supabaseAdmin
              .from('cases')
              .select('description')
              .ilike('title', `%${title}%`)
              .limit(1);
            if (cErr) console.warn('Supabase cases lookup error:', cErr.message || cErr);
            if (cdata && cdata.length) row = { summary: cdata[0].description };
          } catch (e) {
            console.warn('Supabase cases query failed:', e);
          }
        }

        if (row) {
          const sbExtracts: string[] = [];
          if (row.summary) sbExtracts.push(String(row.summary).trim());
          if (row.extracts && Array.isArray(row.extracts)) sbExtracts.push(...row.extracts.map((x: any) => String(x).trim()));
          const added = sbExtracts.filter(Boolean).length;
          if (added > 0) {
            validatedData.extracts = Array.from(new Set([...(validatedData.extracts || []), ...sbExtracts])).slice(0, 5);
            console.log(`🧩 Added ${added} extracts from Supabase fallback to case study input`);
          }
        }
      }
    } catch (err) {
      console.error('Supabase fallback error:', err);
    }

    // If still lacking extracts, use Milvus URLs: fetch content, summarize, and cache to Supabase
    try {
      const needMore = !validatedData.extracts || validatedData.extracts.length < 3;
      if (needMore && process.env.MILVUS_HOST) {
        const queryText = `${validatedData.title} ${validatedData.summary}`.slice(0, 4000);
        const hits = await searchByText(queryText, 5);
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        for (const h of (hits || [])) {
          try {
            const url = h.url || h.payload?.url || h.metadata?.url;
            if (!url) continue;

            // Check cache first
            const cacheKey = `grounding:${validatedData.citation}:${encodeURIComponent(url)}`;
            let cached: { value?: { summary?: string } } | null = null;
            try {
              const { data } = await supabaseAdmin.from('cache').select('value').eq('key', cacheKey).limit(1).single();
              cached = (data as { value?: { summary?: string } } | null) || null;
            } catch {
              cached = null;
            }
            let summaryText: string | null = null;

            if (cached && cached.value && cached.value.summary) {
              summaryText = cached.value.summary;
            } else {
              // Fetch the URL and extract paragraph text
              const res = await fetch(url, { method: 'GET' });
              if (!res.ok) continue;
              const html = await res.text();
              const paragraphs = Array.from(html.matchAll(/<p[^>]*>(.*?)<\/p>/gis)).map(m => m[1].replace(/<[^>]*>/g, '').trim()).filter(Boolean);
              const content = paragraphs.slice(0, 30).join('\n\n').slice(0, 14000);
              if (!content) continue;

              // Summarize via OpenAI (short summary/extract)
              const prompt = `Summarize the following court judgment into 2-3 concise extracts (each 2-4 sentences) for a non-lawyer user. Use plain English, avoid jargon, and if a legal term is necessary, explain it in simple words. Do not give legal advice.\n\n${content}`;
              const completion = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                  { role: 'system', content: 'You are a legal-document summarizer writing for laypeople. Keep language simple, clear, and practical.' },
                  { role: 'user', content: prompt }
                ],
                max_tokens: 400,
                temperature: 0.2
              });
              summaryText = completion.choices?.[0]?.message?.content?.trim() || null;

              // Cache into Supabase `cache` table for grounding (expires in 1 year)
              if (summaryText) {
                const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
                try {
                  await supabaseAdmin.from('cache').upsert([
                    {
                      key: cacheKey,
                      value: { url, summary: summaryText },
                      cache_type: 'grounding',
                      expires_at: expires
                    }
                  ]);
                } catch (cacheError) {
                  console.warn('Failed to cache grounding:', cacheError);
                }
              }
            }

            if (summaryText) {
              // Split into smaller extracts if necessary
              const pieces = summaryText.split(/\n{2,}|\n-+/).map(s => s.trim()).filter(Boolean).slice(0, 3);
              validatedData.extracts = Array.from(new Set([...(validatedData.extracts || []), ...pieces])).slice(0, 5);
              console.log(`🌐 Added ${pieces.length} extracts from URL ${url}`);
            }

            // Stop if we have enough extracts
            if (validatedData.extracts && validatedData.extracts.length >= 3) break;
          } catch (innerErr) {
            console.warn('Milvus URL enrichment error for hit:', innerErr);
            continue;
          }
        }
      }
    } catch (err) {
      console.error('Milvus URL enrichment error:', err);
    }

    // Generate case study using the enhanced agent
    const result = await caseStudyAgent.generateCaseStudy(validatedData as CaseData, {
      maxRetries: 3,
      timeout: 90000 // 90 seconds
    });

    // Analyze content quality and statistics
    const contentStats = analyzeContentStatistics(result.content);
    const qualityScore = calculateContentQuality(result.content);
    const educationalValue = assessEducationalValue(result.content);

    // Paginate the content using utility function
    const paginatedContent = paginateContent(result.content, 500);

    const processingTime = Date.now() - startTime;
    console.log(`✅ Case study completed in ${processingTime}ms`, {
      wordCount: contentStats.wordCount,
      qualityScore,
      educationalValue
    });

    if (CASE_STUDY_RESPONSE_CACHE_ENABLED) {
      caseStudyCache.set(validatedData.title, validatedData.citation, {
        content: result.content,
        metadata: result.metadata
      });
    }

    return NextResponse.json({
      success: true,
      caseStudy: result.content,
      paginatedContent: paginatedContent,
      totalPages: paginatedContent.length,
      wordsPerPage: 500,
      totalWords: contentStats.wordCount,
      metadata: {
        ...result.metadata,
        processingTimeMs: processingTime,
        isFallback: result.metadata.model === 'fallback',
        contentStatistics: contentStats,
        qualityScore,
        educationalValue
      },
      caseData: {
        title: validatedData.title,
        citation: validatedData.citation,
        court: validatedData.court,
        year: validatedData.year
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`Case study generation error (${processingTime}ms):`, error);
    
    await captureServerException(error, {
      component: 'case-study',
      route: '/api/case-study',
      method: 'POST',
      processingTime,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });

    // Handle validation errors with detailed feedback
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid input data', 
          details: error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }

    // Handle timeout errors
    if (error instanceof Error && (error as any).code === 'TIMEOUT') {
      return NextResponse.json(
        { 
          error: 'Request timeout - case study generation took too long',
          suggestion: 'Please try again with a simpler case or contact support'
        },
        { status: 504 }
      );
    }

    // Handle rate limit errors from OpenAI
    if ((error as any).status === 429) {
      return NextResponse.json(
        { 
          error: 'AI service rate limit exceeded',
          suggestion: 'Please try again in a few moments'
        },
        { status: 429 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { 
        error: 'Failed to generate case study', 
        details: error instanceof Error ? error.message : 'Unknown error',
        suggestion: 'Please try again or contact support if the problem persists'
      },
      { status: 500 }
    );
  }
}
