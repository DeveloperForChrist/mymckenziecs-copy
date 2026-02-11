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
  category?: string;
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

async function extractCaseType(title: string, summary: string, category?: string): Promise<string> {
  // Use category if provided
  if (category) {
    const categoryMap: { [key: string]: string } = {
      'procedure': 'procedural',
      'contract_consumer': 'contract',
      'public_law': 'public-law',
      'remedies': 'remedies',
      'evidence_misc': 'general'
    };
    return categoryMap[category] || category;
  }
  
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
  if (text.includes('personal injury') || text.includes('negligence') || text.includes('damages')) {
    return 'personal-injury';
  }
  if (text.includes('criminal') || text.includes('prosecution')) {
    return 'criminal';
  }
  
  return 'general';
}

async function extractYear(citation: string): Promise<number | null> {
  const match = citation.match(/(\d{4})/);
  return match ? parseInt(match[1]) : null;
}

async function populateFromCurated() {
  console.log('📚 Loading curated cases...\n');
  const curatedPath = path.join(process.cwd(), 'data', 'bronze', 'case-law', 'curated.json');
  
  if (!fs.existsSync(curatedPath)) {
    console.log('⚠️  curated.json not found, skipping');
    return 0;
  }

  const cases: CaseData[] = JSON.parse(fs.readFileSync(curatedPath, 'utf-8'));
  console.log(`Found ${cases.length} curated cases`);
  
  return cases;
}

async function populateFromCandidates() {
  console.log('📚 Loading candidate cases...\n');
  const candidatesPath = path.join(process.cwd(), 'data', 'bronze', 'case-law', 'uksc-candidates.jsonl');
  
  if (!fs.existsSync(candidatesPath)) {
    console.log('⚠️  uksc-candidates.jsonl not found, skipping');
    return 0;
  }

  const fileContent = fs.readFileSync(candidatesPath, 'utf-8');
  const lines = fileContent.trim().split('\n');
  const cases: CaseData[] = lines.map(line => JSON.parse(line));
  
  console.log(`Found ${cases.length} candidate cases`);
  
  return cases;
}

async function insertCase(caseData: CaseData, index: number, total: number): Promise<boolean> {
  try {
    console.log(`[${index + 1}/${total}] Processing: ${caseData.citation} - ${caseData.title.substring(0, 50)}...`);

    // Create embedding from title + summary
    const textToEmbed = `${caseData.title} ${caseData.summary || ''}`;
    const embedding = await generateEmbedding(textToEmbed);

    // Extract case type
    const caseType = await extractCaseType(caseData.title, caseData.summary || '', caseData.category);
    
    // Extract year
    const year = await extractYear(caseData.citation);

    // Combine extracts into single text
    const extractsText = Array.isArray(caseData.extracts)
      ? caseData.extracts.join('\n\n')
      : '';

    // Insert into Supabase using REST API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/case_law`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal,resolution=ignore-duplicates'
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
        })
      }
    );

    if (!response.ok && response.status !== 409) {
      const error = await response.text();
      console.error(`  ❌ Error: ${error}`);
      return false;
    } else if (response.status === 409) {
      console.log(`  ⏭️  Already exists, skipping`);
      return false;
    } else {
      console.log(`  ✅ Inserted`);
      return true;
    }

  } catch (error: any) {
    console.error(`  ❌ Exception: ${error.message}`);
    return false;
  }
}

async function populateAllCaseLaw() {
  console.log('🚀 Starting case law population...\n');

  // Load all cases
  const curatedCases = await populateFromCurated();
  const candidateCases = await populateFromCandidates();
  
  const allCases = [...(Array.isArray(curatedCases) ? curatedCases : []), ...(Array.isArray(candidateCases) ? candidateCases : [])];
  
  console.log(`\n📊 Total cases to process: ${allCases.length}\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < allCases.length; i++) {
    const inserted = await insertCase(allCases[i], i, allCases.length);
    
    if (inserted) {
      successCount++;
    } else {
      // Check if it was skipped or errored based on log
      skipCount++;
    }

    // Rate limiting: wait 100ms between API calls to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));

    // Progress checkpoint every 50 cases
    if ((i + 1) % 50 === 0) {
      console.log(`\n📊 Progress: ${i + 1}/${allCases.length} processed (${successCount} new, ${skipCount} skipped)\n`);
    }
  }

  console.log(`\n✨ Population complete!`);
  console.log(`✅ Successfully inserted: ${successCount}`);
  console.log(`⏭️  Skipped (duplicates): ${skipCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`📊 Total: ${allCases.length}`);
  
  // Final count in database
  const { count, error } = await supabase
    .from('case_law')
    .select('*', { count: 'exact', head: true });
  
  if (!error) {
    console.log(`\n🗄️  Total cases in database: ${count}`);
  }
}

// Run the function
populateAllCaseLaw().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
