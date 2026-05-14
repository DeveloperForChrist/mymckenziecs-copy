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
    console.log('🔄 Running team invitations and inbox messages migration...\n');
    
    // Read the migration file
    const migrationPath = path.join(path.resolve(), 'supabase/migrations/20260514130000_create_team_invitations_and_inbox_messages.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📋 Migration SQL loaded\n');
    console.log('---SQL START---');
    console.log(migrationSQL);
    console.log('---SQL END---\n');
    
    // Execute the migration using exec function
    const { error } = await supabase.rpc('exec', { sql: migrationSQL });
    
    if (error) {
      console.error('❌ Error executing migration:', error.message);
      console.log('\n⚠️  Please run this migration manually in the Supabase SQL Editor:');
      console.log('1. Go to your Supabase project dashboard');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Copy and paste the SQL from:');
      console.log(`   ${migrationPath}`);
      console.log('4. Click "Run"\n');
      process.exit(1);
    }
    
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('Error during migration:', error);
    console.log('\n📋 Manual Migration Steps:');
    console.log('1. Go to your Supabase project dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the SQL from:');
    console.log('   supabase/migrations/20260514130000_create_team_invitations_and_inbox_messages.sql');
    console.log('4. Click "Run"\n');
    process.exit(1);
  }
}

runMigration();
