#!/usr/bin/env python3
"""
Execute SQL migration against Supabase using admin credentials
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

# Load .env.local
load_dotenv('.env.local')

# Get database credentials from Supabase connection string
# Format: postgres://postgres:[PASSWORD]@[HOST]:5432/postgres
service_role_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')

# Extract host from URL (e.g., https://rxvuoixenzzxztjlsgms.supabase.co -> rxvuoixenzzxztjlsgms.supabase.co)
if supabase_url:
    host = supabase_url.replace('https://', '').replace('http://', '')

# Supabase connection details
db_host = f"{host}"
db_port = "5432"
db_name = "postgres"
db_user = "postgres"
db_password = service_role_key  # Using service role as password is not ideal - would need actual credentials

# Try to get actual DB credentials from .env.local
db_password = os.getenv('SUPABASE_DB_PASSWORD', '')

if not db_password:
    print("❌ Error: SUPABASE_DB_PASSWORD not found in .env.local")
    print("\nTo run migrations, you need database credentials.")
    print("Please run the SQL migration manually:")
    print("1. Go to https://app.supabase.com/project/rxvuoixenzzxztjlsgms/sql/new")
    print("2. Copy and paste: scripts/supabase/migration_case_law.sql")
    print("3. Click 'Run'")
    sys.exit(1)

try:
    # Read migration file
    with open('scripts/supabase/migration_case_law.sql', 'r') as f:
        migration_sql = f.read()
    
    # Connect to database
    print(f"🔄 Connecting to Supabase database at {db_host}...")
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        database=db_name,
        user=db_user,
        password=db_password
    )
    
    cursor = conn.cursor()
    
    print("🚀 Running migration...")
    cursor.execute(migration_sql)
    
    conn.commit()
    cursor.close()
    conn.close()
    
    print("✅ Migration completed successfully!")
    
except Exception as e:
    print(f"❌ Error: {e}")
    print("\nPlease run the SQL migration manually:")
    print("1. Go to https://app.supabase.com/project/rxvuoixenzzxztjlsgms/sql/new")
    print("2. Copy and paste: scripts/supabase/migration_case_law.sql")
    print("3. Click 'Run'")
    sys.exit(1)
