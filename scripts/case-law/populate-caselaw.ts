import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(path.resolve(), '.env.local') });

interface CaseData {
  title: string;
  citation: string;
  url?: string;
  summary?: string;
  extracts?: string[];
  year?: number;
  court?: string;
  outcome?: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function extractCaseType(title: string, summary: string): Promise<string> {
  const text = `${title} ${summary}`.toLowerCase();
  
  if (text.includes('employment') || text.includes('redundancy') || text.includes('unfair dismissal')) {
    return 'employment';
  }
  if (text.includes('housing') || text.includes('landlord') || text.includes('tenant')) {
    return 'housing';
  }
  if (text.includes('contract') || text.includes('breach')) {
    return 'contract';
  }
  if (text.includes('family') || text.includes('divorce') || text.includes('custody')) {
    return 'family';
  }
  if (text.includes('personal injury') || text.includes('negligence') || text.includes('damage')) {
    return 'personal-injury';
  }
  if (text.includes('criminal') || text.includes('conviction')) {
    return 'criminal';
  }
  
  return 'general';
}

async function extractYear(citation: string): Promise<number | null> {
  const match = citation.match(/(\d{4})/);
  return match ? parseInt(match[1]) : null;
}

async function populateCaselaw() {
  console.log('🚀 Starting case law population...\n');

  // Read curated cases
  const curatedPath = path.join(process.cwd(), 'data', 'bronze', 'case-law', 'curated.json');
  
  if (!fs.existsSync(curatedPath)) {
    console.error('❌ curated.json not found at', curatedPath);
    process.exit(1);
  }

  const cases: CaseData[] = JSON.parse(fs.readFileSync(curatedPath, 'utf-8'));
  console.log(`📚 Found ${cases.length} cases to process\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < cases.length; i++) {
    const caseData = cases[i];
    
    try {
      console.log(`[${i + 1}/${cases.length}] Processing: ${caseData.citation} - ${caseData.title.substring(0, 50)}...`);

      // Create embedding from title + summary
      const textToEmbed = `${caseData.title} ${caseData.summary || ''}`;
      const embedding = await generateEmbedding(textToEmbed);

      // Extract case type
      const caseType = await extractCaseType(caseData.title, caseData.summary || '');
      
      // Extract year
      const year = await extractYear(caseData.citation);

      // Combine extracts into single text
      const extractsText = Array.isArray(caseData.extracts)
        ? caseData.extracts.join('\n\n')
        : '';

      // Insert into Supabase using REST API to avoid schema cache issues
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/case_law`,
        {
          method: 'POST',
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            citation: caseData.citation,
            title: caseData.title,
            url: caseData.url || null,
            summary: caseData.summary || null,
            extracts: extractsText || null,
            case_type: caseType,
            year: year,
            court: caseData.court || null,
            outcome: caseData.outcome || null,
            embedding: embedding
            // raw_data removed - PostgREST doesn't expose it in schema cache
          })
        }
      );

      const error = !response.ok ? await response.text() : null;

      if (error) {
        console.error(`  ❌ Error: ${error}`);
        errorCount++;
      } else {
        console.log(`  ✅ Inserted`);
        successCount++;
      }

      // Rate limiting: wait 100ms between API calls to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error: any) {
      console.error(`  ❌ Exception: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n✨ Population complete!`);
  console.log(`✅ Successfully inserted: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`📊 Total: ${cases.length}`);
}

// Run the function
populateCaselaw().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
