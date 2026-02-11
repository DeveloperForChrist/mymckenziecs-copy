import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

// Helper to safely extract text from DOCX
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (error) {
    console.warn('DOCX extraction failed:', error);
    return '';
  }
}

// Helper to safely extract text from PDF
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text || '';
  } catch (error) {
    console.warn('PDF extraction failed:', error);
    return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let content = '';

    // Extract text based on file type
    if (file.name.toLowerCase().endsWith('.pdf')) {
      content = await extractPdfText(buffer);
    } else if (file.name.toLowerCase().endsWith('.docx')) {
      content = await extractDocxText(buffer);
    } else if (file.name.toLowerCase().endsWith('.txt')) {
      content = buffer.toString('utf-8');
    } else {
      // Try as text
      content = buffer.toString('utf-8');
    }

    // Check if content is too short
    if (!content || content.trim().length < 50) {
      return NextResponse.json({
        success: true,
        analysis: 'Unable to extract text from this document. The file may be:\n\n- Scanned/image-based (no selectable text)\n- Encrypted or password-protected\n- Corrupted or in an unsupported format\n\nPlease try:\n- Saving as a text file (.txt)\n- Using OCR software to extract text from scanned documents\n- Ensuring the document is not password-protected',
        documentName: file.name,
        contentLength: 0
      });
    }

    // Analyze with OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a legal document analyst helping UK litigants in person. 
Analyze the provided document and give structured feedback including:

1. **Document Type**: Identify what kind of legal document this is
2. **Key Information**: Important dates, parties, amounts, deadlines
3. **Legal Issues**: Potential problems or concerns
4. **Strengths**: What's done well
5. **Areas for Improvement**: Specific actionable recommendations
6. **Next Steps**: What the litigant should do next

Be specific, practical, and use clear plain English.`
        },
        {
          role: 'user',
          content: `Analyze this legal document:\n\nFile: ${file.name}\n\nContent:\n${content.substring(0, 8000)}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const analysis = response.choices[0]?.message?.content || 'Unable to analyze.';

    return NextResponse.json({
      success: true,
      analysis,
      documentName: file.name,
      contentLength: content.length
    });
  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Server error', errorType: error?.constructor?.name },
      { status: 500 }
    );
  }
}
