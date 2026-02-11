import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'

/**
 * DELETE /api/chat/cleanup
 * 
 * Deletes all messages for a guest session (conversation with no case_id)
 * Called when guest user closes the chat or leaves
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

    // Delete all messages for this conversation that have no case_id (guest messages only)
    const { error } = await supabaseAdmin
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId)
      .is('case_id', null) // Only delete guest messages (case_id is NULL)

    if (error) {
      console.error('Failed to cleanup guest messages:', error)
      return NextResponse.json(
        { error: 'Cleanup failed', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, message: 'Guest session cleaned up' },
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
