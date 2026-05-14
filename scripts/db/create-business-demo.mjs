#!/usr/bin/env node

/**
 * Script to create a business demo account
 * Usage: node scripts/db/create-business-demo.mjs [email] [password]
 * Defaults: demo-business@mymckenziecs.com / DemoPass123!
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL')
  console.error('   SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createBusinessDemo() {
  const email = process.argv[2] || 'demo-business@mymckenziecs.com'
  const password = process.argv[3] || 'DemoPass123!'
  const fullName = 'Demo Business User'

  console.log(`\n🔧 Creating business demo account: ${email}`)

  // Check if user already exists
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers()
  
  if (listError) {
    console.error('❌ Failed to list users:', listError.message)
    process.exit(1)
  }

  const existingUser = existingUsers.users.find(u => u.email === email)
  
  if (existingUser) {
    console.log(`⚠️  User ${email} already exists`)
    console.log(`   User ID: ${existingUser.id}`)
    
    // Check if user is in users table
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id, email, name, account_type, billing_audience')
      .eq('id', existingUser.id)
      .single()

    if (dbUser) {
      console.log(`   Database record exists: ${dbUser.account_type} account`)
    }
    
    console.log('\n📧 Login with:')
    console.log(`   Email: ${email}`)
    console.log(`   Password: ${password}`)
    console.log(`\n   Or sign in at: http://localhost:3000/auth/signin`)
    process.exit(0)
  }

  // Create the user with Supabase Auth Admin API
  const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-verify email
    user_metadata: {
      full_name: fullName,
      first_name: 'Demo',
      last_name: 'Business',
      display_name: fullName,
      account_type: 'business',
      billing_audience: 'business',
    },
  })

  if (createError || !createdUser.user?.id) {
    console.error('❌ Failed to create user:', createError?.message || 'Unknown error')
    process.exit(1)
  }

  const userId = createdUser.user.id
  console.log(`✅ Created auth user: ${userId}`)

  // Create user record in database
  const { error: upsertError } = await supabase
    .from('users')
    .upsert({
      id: userId,
      email,
      name: fullName,
      account_type: 'business',
      billing_audience: 'business',
      email_verified_at: new Date().toISOString(),
    }, { onConflict: 'id' })

  if (upsertError) {
    console.error('❌ Failed to create database record:', upsertError.message)
    console.log('⚠️  Auth user was created but database record failed')
    console.log(`   You may need to delete the auth user manually and retry`)
    process.exit(1)
  }

  console.log(`✅ Created database record`)
  console.log(`\n🎉 Business demo account created successfully!`)
  console.log(`\n📧 Account Details:`)
  console.log(`   Email: ${email}`)
  console.log(`   Password: ${password}`)
  console.log(`   Type: Business Account`)
  console.log(`\n🔗 Login at: http://localhost:3000/auth/signin`)
  console.log(`   Or: http://localhost:3000/business/dashboard`)
}

createBusinessDemo().catch((error) => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
