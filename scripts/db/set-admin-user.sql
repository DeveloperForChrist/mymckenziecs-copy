-- Set a user as admin
-- Replace 'user-email@example.com' with the actual admin user's email

UPDATE users 
SET role = 'admin', updated_at = NOW()
WHERE email = 'user-email@example.com';

-- Verify the change
SELECT id, email, name, role, created_at 
FROM users 
WHERE role = 'admin';

-- If the role column doesn't exist, add it first:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
