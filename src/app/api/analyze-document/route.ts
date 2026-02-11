import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { aiRateLimiter, rateLimit, getIdentifier } from '@/lib/utils/rate-limit';
import { analyzeDocumentSchema } from '@/validators/index';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Server-side Supabase client for accessing storage
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // For now, we'll use a simple text extraction
  // In production, you'd use pdf-parse or similar
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    return '';
  }
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error('DOCX parsing error:', error);
    return '';
  }
}

async function analyzeDocument(text: string, fileName: string, docType: string): Promise<string> {
  const systemPrompt = `You are a legal document analyst helping UK litigants in person. 
Analyze the provided document and provide structured feedback including:

1. **Document Type Identification**: What kind of legal document is this?
2. **Key Information Extracted**: Important dates, parties, amounts, deadlines
3. **Legal Issues Spotted**: Potential problems, missing information, or concerns
4. **Strengths**: What's done well in this document
5. **Suggestions for Improvement**: Specific actionable recommendations
6. **Next Steps**: What the litigant should do next
7. **Missing Information**: What crucial details are absent

Be specific, practical, and focused on UK civil procedure. Use clear, plain English.`;

  const userPrompt = `File Name: ${fileName}
Document Type: ${docType}

Document Content:
${text.substring(0, 8000)}

Please analyze this document thoroughly and provide your feedback.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    return response.choices[0]?.message?.content || 'Unable to analyze document.';
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error('Failed to analyze document with AI');
  }
}

export async function POST(req: NextRequest) {
  let authData: any = null
  try {
    // Get user session for rate limiting
    const supabase = await createSupabaseRouteClient()
    try {
      const authResp = await supabase.auth.getUser()
      authData = authResp.data
    } catch (e) {
      authData = null
    }
    const userId = authData?.user?.id
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
    
    // Apply rate limiting (10 requests per 60 seconds for AI operations)
    const identifier = getIdentifier(userId, ip || undefined)
    const rateLimitResult = await rateLimit(aiRateLimiter, identifier, 10, 60000)
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Too many requests',
          message: 'You have exceeded the rate limit. Please try again later.',
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

    const body = await req.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    // Fetch document metadata from database
    const { data: document, error: dbError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (dbError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Download document from Supabase storage
    const { data: fileData, error: storageError } = await supabaseAdmin
      .storage
      .from('user-uploads')
      .download(document.storage_path);

    if (storageError || !fileData) {
      return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
    }

    // Convert to buffer
    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Extract text based on file type
    let extractedText = '';
    
    if (document.mime_type?.includes('pdf') || document.type === 'pdf') {
      extractedText = await extractTextFromPDF(buffer);
    } else if (document.mime_type?.includes('wordprocessingml') || document.mime_type?.includes('word') || document.type === 'docx') {
      extractedText = await extractTextFromDOCX(buffer);
    } else if (document.mime_type?.includes('text') || document.type === 'doc') {
      extractedText = buffer.toString('utf-8');
    } else {
      return NextResponse.json({ 
        error: 'Unsupported file type. Only PDF, DOCX and text documents can be analyzed.' 
      }, { status: 400 });
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return NextResponse.json({ 
        error: 'Could not extract enough text from document. It may be scanned or image-based.' 
      }, { status: 400 });
    }

    // Analyze with AI
    const analysis = await analyzeDocument(
      extractedText,
      document.name,
      document.type
    );

    // Optionally save analysis to database
    try {
      await supabaseAdmin
        .from('document_analyses')
        .insert({
          document_id: documentId,
          analysis_text: analysis,
          analyzed_at: new Date().toISOString()
        })
    } catch (err) {
      console.log('Failed to save analysis:', err);
    }

    return NextResponse.json({
      success: true,
      analysis,
      documentName: document.name,
      extractedLength: extractedText.length
    });

  } catch (error: any) {
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        api: 'analyze-document',
        userId: authData?.user?.id,
      },
      contexts: {
        request: {
          url: req.url,
          method: req.method,
        }
      }
    })

    console.error('Document analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze document' },
      { status: 500 }
    );
  }
}
