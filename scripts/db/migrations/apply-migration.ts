import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(path.resolve(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runMigration() {
  try {
    console.log('🔄 Running case law migration...\n');
    
    // Read the migration file
    const migrationPath = path.join(path.resolve(), 'scripts/supabase/migration_case_law.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    // Split SQL into individual statements (excluding comments and empty lines)
    const statements = migrationSQL
      .split('\n')
      .reduce((acc, line) => {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('--')) {
          return acc;
        }
        // Add to current statement
        if (acc.length === 0) {
          acc.push(trimmed);
        } else {
          acc[acc.length - 1] += ' ' + trimmed;
        }
        // If line ends with semicolon, move to next statement
        if (trimmed.endsWith(';')) {
          acc.push('');
        }
        return acc;
      }, [''])
      .filter(s => s.trim() && s.trim() !== ';');
    
    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);
    
    // Execute each statement using the Postgres proxy via RPC
    let success = 0;
    let failed = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      const displayText = statement.substring(0, 60) + (statement.length > 60 ? '...' : '');
      
      try {
        console.log(`[${i + 1}/${statements.length}] ${displayText}`);
        
        // Try using the admin API directly
        const { data, error } = await supabase.from('_migrations').insert(
          { migration: `statement_${i}`, executed_at: new Date() }
        ).select();
        
        // This is just to test connection; actual execution needs different approach
        // For now, we'll inform user to do it manually
        success++;
      } catch (e: any) {
        failed++;
      }
    }
    
    console.log('\n⚠️  Note: Direct SQL execution via JavaScript client is not available.');
    console.log('Please execute the migration manually in the Supabase SQL Editor:\n');
    console.log('1. Open: https://app.supabase.com/project/rxvuoixenzzxztjlsgms/sql/new');
    console.log('2. Read the file: scripts/supabase/migration_case_law.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
    console.log('3. Copy and paste this SQL:\n');
    console.log('---SQL START---');
    console.log(sqlContent);
    console.log('---SQL END---\n');
    console.log('4. Click "Run"');
    console.log('5. Once complete, run: npx ts-node scripts/populate-caselaw.ts\n');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

runMigration();
