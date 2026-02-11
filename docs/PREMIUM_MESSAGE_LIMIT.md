# Premium User 20-Message-Per-Thread Limit Feature

## Overview
Premium users (premium/premium pro) now have unlimited chat threads but are limited to **20 messages per thread**. Free/freemium users continue to have the existing 25 messages per case limit.

## Architecture

### Database Schema Changes
**File**: `scripts/supabase/schema.sql`

Added to the `messages` table:
- `conversation_id UUID` - Tracks which thread/conversation within a case a message belongs to
- Index: `CREATE INDEX idx_messages_conversation_id ON messages(conversation_id)` - For efficient per-conversation queries

### ChatManager Implementation
**File**: `src/lib/ai/chat-manager.ts`

#### New Method: `ensurePremiumMessageAllowance()`
- **Location**: Lines 355-377
- **Signature**: `private async ensurePremiumMessageAllowance(caseId: string | null, conversationId?: string)`
- **Purpose**: Enforces the 20-message-per-thread limit for premium users
- **Logic**:
  1. Only applies to premium/premium pro plan users
  2. Requires both `caseId` and `conversationId` context
  3. Queries message count from `messages` table WHERE `conversation_id = X AND role = 'user'`
  4. Throws `PlanLimitError` if count >= 20
- **Error Message**: "Premium plans include up to 20 messages per thread. Start a new conversation to continue."

#### Updated Method: `storeRawMessage()`
- **Location**: Lines 723-776
- **Changes**:
  1. Now calls both `ensureFreePlanMessageAllowance()` and `ensurePremiumMessageAllowance()` for user messages
  2. Includes `conversation_id` in the database insert alongside `case_id`
  3. Ensures conversation ID is always tracked for message limiting

### API Endpoint Changes
**File**: `src/app/api/message-count/route.ts`

Updated to support dual query modes:
- **Free plan queries**: `GET /api/message-count?caseId=<case_id>` - Returns message count for entire case
- **Premium plan queries**: `GET /api/message-count?conversationId=<conversation_id>` - Returns message count for specific thread

### Frontend UI Updates

#### ChatbotNavbar Component
**File**: `src/components/chatbot/ChatbotNavbar.tsx`

**New State Variables**:
- `premiumThreadMessageCount` - Tracks current thread's message count for premium users
- `currentConversationId` - Stores active conversation ID
- `PREMIUM_MESSAGE_LIMIT_PER_THREAD` constant = 20

**New Effects**:
1. **Premium message count fetcher** (Lines 207-225):
   - Fetches per-conversation message count when `currentConversationId` changes
   - Only active for premium/premium pro users
   - Uses `/api/message-count?conversationId=...` endpoint

2. **Conversation ID listener** (Lines 227-233):
   - Listens for `currentConversationIdChanged` custom event from ChatInterface
   - Updates `currentConversationId` state

**Updated Topbar Display**:
- **Freemium users**: Shows "Messages: X/25" (existing behavior)
- **Premium users with active thread**: Shows "Thread: X/20" in purple theme
- Both display color-coded status:
  - 🟢 Green (< 80%): Safe
  - 🟠 Orange (80-99%): Warning
  - 🔴 Red (100%): Limit reached

#### ChatInterface Component
**File**: `src/components/chatbot/ChatInterface.tsx`

**New Effect** (Lines 1532-1537):
- Broadcasts conversation ID changes via custom event `currentConversationIdChanged`
- Allows sibling components (ChatbotNavbar) to track active conversation
- Fired whenever `conversationId` state changes

### Message Flow Diagram

```
User sends message (premium user, conversation thread active)
    ↓
ChatInterface → /api/chat (POST)
    ↓
ChatManager.storeRawMessage()
    ↓
ensureFreePlanMessageAllowance() [✓ skipped, not free plan]
    ↓
ensurePremiumMessageAllowance(caseId, conversationId)
    ↓
Query: SELECT COUNT(*) FROM messages 
       WHERE conversation_id = ? AND role = 'user'
    ↓
If count >= 20 → Throw PlanLimitError("20 messages per thread")
    ↓
Insert message with conversation_id
    ↓
ChatbotNavbar detects conversation ID change
    ↓
Fetch /api/message-count?conversationId=...
    ↓
Display "Thread: X/20" in topbar
```

## Implementation Details

### Conversation ID Generation
- Format: `conv_<timestamp>_<random_string>`
- Generated in ChatInterface on new thread creation
- Generated in ChatManager if not provided
- Broadcasted to navbar via custom event

### Database Queries
- **Free plan**: `SELECT COUNT(*) FROM messages WHERE case_id = ? AND role = 'user'`
- **Premium plan**: `SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND role = 'user'`
- Indexed on `conversation_id` for performance

### Error Handling
- `PlanLimitError` with code `'message_limit'` thrown at limit
- Client receives error and can display "20 messages per thread" message
- Guides user to start new conversation thread

## Migration Path

When deploying this feature:

1. **Database Migration** (Required):
   - Run: `ALTER TABLE messages ADD COLUMN conversation_id UUID;`
   - Run: `CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);`
   - Existing messages will have NULL conversation_id, which is fine

2. **Code Deployment**:
   - Deploy ChatManager changes (includes `ensurePremiumMessageAllowance()`)
   - Deploy ChatInterface changes (broadcasts conversation ID)
   - Deploy ChatbotNavbar changes (displays thread message count)
   - Deploy message-count endpoint changes (handles conversationId param)

3. **Backwards Compatibility**:
   - Free users unaffected (continues using case_id-based limiting)
   - Existing conversations without conversation_id still work (NULL value)
   - New conversations generate and store conversation_id

## Testing

### Premium User Scenario
1. Sign up with premium plan
2. Open new conversation (generates conversation_id)
3. Send 20 messages in thread
4. At message 21: Receives error "Premium plans include up to 20 messages per thread"
5. Cannot send 21st message until starting new thread
6. New thread has new conversation_id and resets counter to 0/20

### Freemium User Scenario
1. Sign up with free plan
2. Send 25 messages in case
3. At message 26: Receives error about free plan limits
4. Behavior unchanged from before

### Multiple Conversations
1. Premium user creates thread A with 10 messages
2. Creates thread B with 15 messages
3. Both threads work independently with their own counters
4. Can send 5 more messages in thread A before hitting 20-message limit

## API Changes Summary

| Endpoint | Method | Old Behavior | New Behavior |
|----------|--------|--------------|--------------|
| `/api/message-count` | GET | Required: `caseId` param | Optional: `caseId` OR `conversationId` param |
| `/api/chat` | POST | Stored messages by case_id only | Stores messages with both case_id AND conversation_id |
| N/A | N/A | N/A | New premium limit check in ChatManager |

## Constants

- `FREEMIUM_MESSAGE_LIMIT` = 25 (unchanged)
- `PREMIUM_MESSAGE_LIMIT_PER_THREAD` = 20 (new)
- `FREE_PLAN_MESSAGE_LIMIT` = 25 (in ChatManager, unchanged)

## Files Modified

1. `scripts/supabase/schema.sql` - Added conversation_id column and index
2. `src/lib/ai/chat-manager.ts` - Added ensurePremiumMessageAllowance() method
3. `src/components/chatbot/ChatbotNavbar.tsx` - Added premium message counter display
4. `src/components/chatbot/ChatInterface.tsx` - Added conversation ID broadcast
5. `src/app/api/message-count/route.ts` - Updated to handle conversation_id queries
