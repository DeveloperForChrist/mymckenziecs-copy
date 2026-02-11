#!/usr/bin/env tsx
/**
 * Simple script to add a single case to the vector database
 * Usage: npx tsx scripts/add-case-to-db.ts
 */

import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config({ path: path.join(path.resolve(), '.env.local') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function addCaseToVectorDB() {
  console.log('\n🏛️  Add Case to Vector Database\n');
  
  // Collect case information
  const citation = await question('Citation (e.g., [2024] UKSC 1): ');
  const title = await question('Case title: ');
  const url = await question('URL (optional, press Enter to skip): ');
  const summary = await question('Summary (short description): ');
  const extracts = await question('Key extracts (legal principles): ');
  const caseType = await question('Case type (employment/housing/contract/family/personal-injury/criminal/general): ');
  const yearStr = await question('Year (e.g., 2024): ');
  const court = await question('Court (e.g., Supreme Court): ');
  const outcome = await question('Outcome (optional, e.g., "Appeal allowed"): ');
  
  const year = parseInt(yearStr) || new Date().getFullYear();
  
  console.log('\n⏳ Processing...\n');
  
  try {
    // Step 1: Check if citation already exists
    const { data: existing } = await supabase
      .from('case_law')
      .select('citation')
      .eq('citation', citation)
      .single();
    
    if (existing) {
      console.log('❌ Case with this citation already exists!');
      rl.close();
      return;
    }
    
    // Step 2: Generate embedding from title + summary + extracts
    const textForEmbedding = `${title}\n${summary}\n${extracts}`;
    console.log('🤖 Generating AI embedding...');
    
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: textForEmbedding,
      dimensions: 1536,
    });
    
    const embedding = embeddingResponse.data[0].embedding;
    console.log(`✅ Embedding generated (${embedding.length} dimensions)`);
    
    // Step 3: Insert into Supabase vector database
    console.log('💾 Inserting into database...');
    
    const { data, error } = await supabase
      .from('case_law')
      .insert({
        citation,
        title,
        url: url || null,
        summary,
        extracts,
        case_type: caseType,
        year,
        court,
        outcome: outcome || null,
        embedding: embedding,
      })
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    console.log('\n✅ Successfully added case to vector database!');
    console.log('📊 Case ID:', data.id);
    console.log('📖 Citation:', data.citation);
    console.log('\n💰 Cost: ~$0.0002 for embedding generation\n');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

addCaseToVectorDB();
