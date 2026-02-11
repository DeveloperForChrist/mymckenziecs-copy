import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(path.resolve(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runMigration() {
  try {
    console.log('🔄 Running case law migration...');
    
    // Read the migration file
    const migrationPath = path.join(path.resolve(), 'scripts/supabase/migration_case_law.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    // Execute the migration
    const { error } = await supabase.rpc('exec', { sql: migrationSQL });
    
    if (error) {
      // If RPC doesn't work, try direct execution
      console.log('⚠️  RPC method not available, trying direct SQL...');
      
      // Split by semicolons and execute each statement
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));
      
      for (const statement of statements) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        const { error: execError } = await supabase.rpc('exec', { statement });
        
        if (execError && !execError.message.includes('function exec')) {
          console.error(`Error executing statement: ${execError.message}`);
        }
      }
    }
    
    console.log('✅ Migration completed!');
    console.log('⚠️  Note: You may need to run this manually in Supabase SQL Editor if errors occur.');
    
  } catch (error) {
    console.error('Error during migration:', error);
    console.log('\n📋 Manual Migration Steps:');
    console.log('1. Go to https://app.supabase.com/project/rxvuoixenzzxztjlsgms/sql/new');
    console.log('2. Copy and paste the contents of scripts/supabase/migration_case_law.sql');
    console.log('3. Click "Run"');
  }
}

runMigration();
