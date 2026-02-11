#!/usr/bin/env node

/**
 * Script to set a user as admin in the database
 * Usage: node scripts/db/set-admin-user.mjs user@example.com
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

async function setAdminUser(email) {
  if (!email) {
    console.error('❌ Please provide a user email')
    console.error('Usage: node scripts/db/set-admin-user.mjs user@example.com')
    process.exit(1)
  }

  console.log(`\n🔍 Looking for user: ${email}`)

  // Find the user
  const { data: user, error: findError } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('email', email)
    .single()

  if (findError || !user) {
    console.error(`❌ User not found: ${email}`)
    console.error('Error:', findError?.message)
    process.exit(1)
  }

  console.log(`✅ Found user:`)
  console.log(`   ID: ${user.id}`)
  console.log(`   Name: ${user.name || 'N/A'}`)
  console.log(`   Current Role: ${user.role || 'user'}`)

  // Update the user's role to admin
  const { error: updateError } = await supabase
    .from('users')
    .update({ 
      role: 'admin',
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)

  if (updateError) {
    console.error(`❌ Failed to update user role:`, updateError.message)
    
    // Check if role column exists
    if (updateError.message.includes('column') && updateError.message.includes('role')) {
      console.error('\n💡 The "role" column might not exist in your users table.')
      console.error('   Run this SQL in your Supabase SQL editor:')
      console.error('   ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT \'user\';')
    }
    
    process.exit(1)
  }

  console.log(`\n✅ Successfully set ${email} as admin!`)
  console.log('\n🎉 The user can now access:')
  console.log('   - /admin (Admin Dashboard)')
  console.log('   - /api/admin/* (Admin API routes)')
}

// Get email from command line argument
const email = process.argv[2]
setAdminUser(email)
