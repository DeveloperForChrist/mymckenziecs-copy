import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';

const VALID_CATEGORIES = ['deadline', 'hearing', 'meeting', 'reminder', 'other'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;
const VALID_REPEAT = ['none', 'weekly', 'biweekly', 'monthly'] as const;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

type CalendarCategory = (typeof VALID_CATEGORIES)[number];
type CalendarPriority = (typeof VALID_PRIORITIES)[number];
type RepeatPattern = (typeof VALID_REPEAT)[number];

type CreateEventInput = {
  title: string;
  notes: string | null;
  time: string | null;
  date: Date;
  category: CalendarCategory;
  priority: CalendarPriority;
  type: string;
  repeat: RepeatPattern;
  occurrences: number;
};

function asObject(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function parseDate(input: unknown, field: string): { value?: Date; error?: string } {
  if (typeof input !== 'string' || !input.trim()) {
    return { error: `${field} is required` };
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return { error: `${field} must be a valid date` };
  }
  return { value: parsed };
}

function parseOptionalTime(input: unknown): { value: string | null; error?: string } {
  if (input === null || input === undefined || input === '') {
    return { value: null };
  }
  if (typeof input !== 'string') {
    return { value: null, error: 'time must be a string in HH:mm format' };
  }
  const trimmed = input.trim();
  if (!TIME_PATTERN.test(trimmed)) {
    return { value: null, error: 'time must be in HH:mm format' };
  }
  return { value: trimmed.slice(0, 5) };
}

function validateCreateInput(body: Record<string, unknown>): { value?: CreateEventInput; error?: string } {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 2) {
    return { error: 'title must be at least 2 characters' };
  }
  if (title.length > 180) {
    return { error: 'title must be 180 characters or fewer' };
  }

  const dateResult = parseDate(body.date, 'date');
  if (!dateResult.value) {
    return { error: dateResult.error };
  }

  const timeResult = parseOptionalTime(body.time);
  if (timeResult.error) {
    return { error: timeResult.error };
  }

  const category = typeof body.category === 'string' ? body.category : 'deadline';
  if (!VALID_CATEGORIES.includes(category as CalendarCategory)) {
    return { error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` };
  }

  const priority = typeof body.priority === 'string' ? body.priority : 'medium';
  if (!VALID_PRIORITIES.includes(priority as CalendarPriority)) {
    return { error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` };
  }

  const notes =
    typeof body.notes === 'string'
      ? body.notes.trim()
      : body.notes === null || body.notes === undefined
      ? null
      : String(body.notes);
  if (notes && notes.length > 2000) {
    return { error: 'notes must be 2000 characters or fewer' };
  }

  const type =
    typeof body.type === 'string' && body.type.trim().length
      ? body.type.trim().slice(0, 60)
      : 'user_created';

  const repeat = typeof body.repeat === 'string' ? body.repeat : 'none';
  if (!VALID_REPEAT.includes(repeat as RepeatPattern)) {
    return { error: `repeat must be one of: ${VALID_REPEAT.join(', ')}` };
  }

  const rawOccurrences = body.occurrences;
  const occurrences =
    repeat === 'none'
      ? 1
      : typeof rawOccurrences === 'number'
      ? rawOccurrences
      : typeof rawOccurrences === 'string'
      ? Number.parseInt(rawOccurrences, 10)
      : 4;

  if (repeat !== 'none') {
    if (!Number.isInteger(occurrences) || occurrences < 2 || occurrences > 24) {
      return { error: 'occurrences must be an integer between 2 and 24 for recurring events' };
    }
  }

  return {
    value: {
      title,
      notes,
      time: timeResult.value,
      date: dateResult.value,
      category: category as CalendarCategory,
      priority: priority as CalendarPriority,
      type,
      repeat: repeat as RepeatPattern,
      occurrences,
    },
  };
}

function addRepeatingDate(base: Date, repeat: RepeatPattern, index: number): Date {
  const next = new Date(base);
  if (repeat === 'weekly') {
    next.setDate(next.getDate() + index * 7);
    return next;
  }
  if (repeat === 'biweekly') {
    next.setDate(next.getDate() + index * 14);
    return next;
  }
  if (repeat === 'monthly') {
    next.setMonth(next.getMonth() + index);
    return next;
  }
  return next;
}

function normalizeDateFilter(input: string | null, label: string): { value?: string; error?: string } {
  if (!input) return {};
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return { error: `${label} must be a valid date` };
  }
  return { value: parsed.toISOString() };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = authData.user.id;
    const { searchParams } = new URL(request.url);

    const start = normalizeDateFilter(searchParams.get('startDate'), 'startDate');
    if (start.error) {
      return NextResponse.json({ error: start.error }, { status: 400 });
    }
    const end = normalizeDateFilter(searchParams.get('endDate'), 'endDate');
    if (end.error) {
      return NextResponse.json({ error: end.error }, { status: 400 });
    }

    let query = supabase.from('calendar_events').select('*').eq('user_id', userId).order('date', { ascending: true });
    if (start.value) query = query.gte('date', start.value);
    if (end.value) query = query.lte('date', end.value);

    const { data: events, error } = await query;
    if (error) {
      console.error('Calendar fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    return NextResponse.json({
      events: events || [],
      count: events?.length || 0,
    });
  } catch (error) {
    console.error('Calendar GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = authData.user.id;
    const rawBody = asObject(await request.json());
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = validateCreateInput(rawBody);
    if (!parsed.value) {
      return NextResponse.json({ error: parsed.error || 'Invalid request' }, { status: 400 });
    }

    const recurrenceId = parsed.value.repeat === 'none' ? null : randomUUID();
    const totalEvents = parsed.value.repeat === 'none' ? 1 : parsed.value.occurrences;
    const nowIso = new Date().toISOString();

    const eventsToInsert = Array.from({ length: totalEvents }, (_, index) => {
      const nextDate = addRepeatingDate(parsed.value!.date, parsed.value!.repeat, index);
      return {
        user_id: userId,
        title: parsed.value!.title,
        notes: parsed.value!.notes,
        time: parsed.value!.time,
        date: nextDate.toISOString(),
        category: parsed.value!.category,
        priority: parsed.value!.priority,
        type: parsed.value!.type,
        source: recurrenceId ? `recurring:${parsed.value!.repeat}:${recurrenceId}` : null,
        completed: false,
        created_at: nowIso,
      };
    });

    const { data: insertedEvents, error } = await supabase
      .from('calendar_events')
      .insert(eventsToInsert)
      .select('*');

    if (error) {
      console.error('Calendar create error:', error);
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }

    const sorted = (insertedEvents || []).sort((a: any, b: any) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    return NextResponse.json({
      success: true,
      event: sorted[0] || null,
      events: sorted,
      createdCount: sorted.length,
    });
  } catch (error) {
    console.error('Calendar POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = authData.user.id;
    const body = asObject(await request.json());
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    if ('title' in body) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title.length < 2 || title.length > 180) {
        return NextResponse.json({ error: 'title must be between 2 and 180 characters' }, { status: 400 });
      }
      updateData.title = title;
    }

    if ('notes' in body) {
      const notes =
        typeof body.notes === 'string'
          ? body.notes.trim()
          : body.notes === null || body.notes === undefined
          ? null
          : String(body.notes);
      if (notes && notes.length > 2000) {
        return NextResponse.json({ error: 'notes must be 2000 characters or fewer' }, { status: 400 });
      }
      updateData.notes = notes;
    }

    if ('time' in body) {
      const timeResult = parseOptionalTime(body.time);
      if (timeResult.error) {
        return NextResponse.json({ error: timeResult.error }, { status: 400 });
      }
      updateData.time = timeResult.value;
    }

    if ('date' in body) {
      const dateResult = parseDate(body.date, 'date');
      if (!dateResult.value) {
        return NextResponse.json({ error: dateResult.error || 'Invalid date' }, { status: 400 });
      }
      updateData.date = dateResult.value.toISOString();
    }

    if ('category' in body) {
      const category = typeof body.category === 'string' ? body.category : '';
      if (!VALID_CATEGORIES.includes(category as CalendarCategory)) {
        return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
      }
      updateData.category = category;
    }

    if ('priority' in body) {
      const priority = typeof body.priority === 'string' ? body.priority : '';
      if (!VALID_PRIORITIES.includes(priority as CalendarPriority)) {
        return NextResponse.json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` }, { status: 400 });
      }
      updateData.priority = priority;
    }

    if ('completed' in body) {
      if (typeof body.completed !== 'boolean') {
        return NextResponse.json({ error: 'completed must be true or false' }, { status: 400 });
      }
      updateData.completed = body.completed;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided for update' }, { status: 400 });
    }

    const { data: existingEvent, error: fetchError } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const { data: event, error } = await supabase
      .from('calendar_events')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      console.error('Calendar update error:', error);
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      event,
    });
  } catch (error) {
    console.error('Calendar PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = authData.user.id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const { data: existingEvent, error: fetchError } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const { error } = await supabase.from('calendar_events').delete().eq('id', id).eq('user_id', userId);

    if (error) {
      console.error('Calendar delete error:', error);
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Event deleted successfully',
    });
  } catch (error) {
    console.error('Calendar DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
