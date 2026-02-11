import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName } = await request.json()

    // TODO: Integrate Supabase Auth signup
    // For now, return a placeholder response
    
    return NextResponse.json(
      { message: 'Sign up successful', user: { email, fullName } },
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Sign up failed' },
      { status: 500 }
    )
  }
}
