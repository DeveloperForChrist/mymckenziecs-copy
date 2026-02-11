import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // TODO: Integrate Supabase Auth signin
    // For now, return a placeholder response
    
    return NextResponse.json(
      { message: 'Sign in successful', user: { email } },
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Sign in failed' },
      { status: 500 }
    )
  }
}
