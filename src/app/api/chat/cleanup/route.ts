import { NextRequest, NextResponse } from 'next/server'

/**
 * DELETE /api/chat/cleanup
 *
 * Chat messages are now treated as durable conversation history.
 * Cleanup is intentionally disabled to prevent accidental loss.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { conversationId } = await request.json()

    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: true, preserved: true, message: 'Cleanup disabled: conversation history is preserved.' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Chat cleanup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
