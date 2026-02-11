import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';

interface CalendarEntry {
  title?: string;
  date?: string;
  type?: string;
  notes?: string;
  priority?: string;
  category?: string;
}

interface SaveCalendarRequestBody {
  caseId?: string;
  deadlines?: CalendarEntry[];
  hearings?: CalendarEntry[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as SaveCalendarRequestBody;
    const { deadlines = [], hearings = [] } = body;
    const providedCaseId = typeof body?.caseId === 'string' ? body.caseId : undefined;

    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = authData.user.id;

    // Convert deadlines and hearings to calendar events
    const allEntries = [
      ...deadlines.map(d => ({ ...d, category: 'deadline' as const })),
      ...hearings.map(h => ({ ...h, category: 'hearing' as const }))
    ];

    if (allEntries.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const eventsToInsert = allEntries
      .filter(entry => entry.title && entry.date)
      .map(entry => ({
        user_id: userId,
        case_id: providedCaseId || null,
        title: entry.title,
        notes: entry.notes || null,
        date: new Date(entry.date!).toISOString(),
        category: entry.category || 'deadline',
        priority: entry.priority || 'medium',
        type: entry.type || 'ai_extracted',
        created_at: new Date().toISOString(),
      }));

    if (eventsToInsert.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const { error } = await supabase
      .from('calendar_events')
      .insert(eventsToInsert);

    if (error) {
      console.error('Failed to insert calendar events:', error);
      return NextResponse.json({ error: 'Failed to save calendar entries' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: eventsToInsert.length });
  } catch (error) {
    console.error('Calendar save error', error);
    return NextResponse.json({ error: 'Failed to save calendar entries' }, { status: 500 });
  }
}
