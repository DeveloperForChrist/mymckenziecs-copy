import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const { Client } = pg;

// Load environment variables from .env.local
dotenv.config({ path: path.join(path.resolve(), '.env.local') });

// Get the database connection string
// Construct from Supabase credentials if DATABASE_URL not available
let dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!dbUrl) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbPassword = 'Deenyaha1234$'; // Using provided password
  
  if (supabaseUrl && dbPassword) {
    // Extract project ref from Supabase URL
    const url = new URL(supabaseUrl);
    const projectRef = url.hostname.split('.')[0];
    
    // URL encode the password since it contains special characters
    const encodedPassword = encodeURIComponent(dbPassword);
    
    // Use pooler format with correct region and port
    dbUrl = `postgresql://postgres.${projectRef}:${encodedPassword}@aws-1-eu-west-2.pooler.supabase.com:6543/postgres`;
  }
}

if (!dbUrl) {
  console.error('❌ Missing database credentials in .env.local');
  console.error('Need either: DATABASE_URL, POSTGRES_URL, or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({ connectionString: dbUrl });
  
  try {
    console.log('🔄 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');
    
    // Read the migration file
    const migrationPath = path.join(path.resolve(), 'supabase/migrations/20260514130000_create_team_invitations_and_inbox_messages.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📋 Executing migration...\n');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('Created tables: team_invitations, inbox_messages');
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
