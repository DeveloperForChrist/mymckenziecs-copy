# Admin Access Fix

## Problem
Admin tried to change user plan but got "Forbidden" error.

## Root Cause
The new middleware checks for `role = 'admin'` in the users table, but the admin user doesn't have this role set.

## Solution

### Option 1: Use Node Script (Recommended)
```bash
node scripts/db/set-admin-user.mjs admin@yourdomain.com
```

Replace `admin@yourdomain.com` with the actual admin user's email.

### Option 2: Run SQL Directly

1. Go to your Supabase Dashboard → SQL Editor
2. Run this SQL:

```sql
-- Add role column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Set your admin user (replace the email)
UPDATE users 
SET role = 'admin', updated_at = NOW()
WHERE email = 'admin@yourdomain.com';

-- Verify
SELECT id, email, name, role FROM users WHERE role = 'admin';
```

## What Changed

### 1. **Middleware** ([middleware.ts](../middleware.ts))
- Now provides detailed error messages when admin access is denied
- Shows debug info (role, userId) in API responses
- Logs profile fetch errors

### 2. **Admin Users API** ([src/app/api/admin/users/route.ts](../src/app/api/admin/users/route.ts))
- Better error handling with detailed messages
- Validates plan values (No plan, Basic, Premium, Premium +)
- Logs all admin actions for debugging
- Shows specific error details when subscription update fails

### 3. **Helper Scripts**
- `scripts/db/set-admin-user.mjs` - Node script to set admin role
- `scripts/db/set-admin-user.sql` - SQL script for manual execution

## Testing

After setting admin role, test by:

1. Go to `/admin` page
2. Try changing a user's plan
3. Check browser console and terminal logs for detailed messages

## Troubleshooting

**Error: "Forbidden - Admin access required"**
- Run the set-admin script with your email
- Check the debug info in the error response

**Error: "column 'role' does not exist"**
- The users table doesn't have a role column
- Run: `ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';`

**Error: "Failed to update subscription"**
- Check if subscriptions table exists
- Verify SUPABASE_SERVICE_ROLE_KEY is set in .env.local
- Check terminal logs for specific database error

**Plan change succeeds but doesn't show**
- Refresh the admin dashboard page
- Check subscriptions table directly in Supabase

## Database Schema

Your users table should have:
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'user',  -- 'user' or 'admin'
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

Your subscriptions table should have:
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  plan_type TEXT,  -- 'No plan', 'Basic', 'Premium', or 'Premium +'
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
