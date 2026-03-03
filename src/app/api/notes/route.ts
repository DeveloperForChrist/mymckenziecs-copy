import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/database/supabase-route";
import { supabaseAdmin } from "@/lib/database/supabase-server";

interface StoredNotePage {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const MAX_NOTES = 200;

const hasPaidAccess = async (userId: string): Promise<boolean> => {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_type, status")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const label = String(data?.plan_type || "").toLowerCase();
  return Boolean(label && (label.includes("basic") || label.includes("premium")));
};

const isMissingUserNotesTableError = (error: any): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === "PGRST205") return true;
  if (candidate.code === "42P01") return true;
  return typeof candidate.message === "string" && candidate.message.includes("public.user_notes");
};

const toIsoOrNow = (value: any): string => {
  if (typeof value !== "string") return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const sanitizeNotePage = (input: any): StoredNotePage | null => {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, any>;
  if (typeof raw.id !== "string" || typeof raw.title !== "string" || typeof raw.content !== "string") {
    return null;
  }
  const id = raw.id.trim();
  if (!id) return null;
  return {
    id,
    title: raw.title.slice(0, 500),
    content: raw.content.slice(0, 400000),
    createdAt: toIsoOrNow(raw.createdAt),
    updatedAt: toIsoOrNow(raw.updatedAt),
  };
};

const sanitizeNotes = (input: any): StoredNotePage[] | null => {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_NOTES) return null;
  const sanitized: StoredNotePage[] = [];
  for (const page of input) {
    const normalized = sanitizeNotePage(page);
    if (!normalized) return null;
    sanitized.push(normalized);
  }
  return sanitized;
};

const ensureUserRow = async (userId: string, email: string | null | undefined) => {
  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existingUser?.id) return;

  await supabaseAdmin
    .from("users")
    .upsert(
      {
        id: userId,
        email: email || `${userId}@placeholder.local`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
};

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const userId = authData.user.id;
    const { data, error } = await supabaseAdmin
      .from("user_notes")
      .select("notes_pages, active_page_id, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingUserNotesTableError(error)) {
        return NextResponse.json({
          notesPages: [],
          activePageId: "",
          updatedAt: null,
          localOnly: true,
        });
      }
      console.error("Failed to load notes", error);
      return NextResponse.json({ error: "Failed to load notes" }, { status: 500 });
    }

    const notesPages = sanitizeNotes(data?.notes_pages) ?? [];
    const activePageIdRaw = typeof data?.active_page_id === "string" ? data.active_page_id : "";
    const activePageId =
      notesPages.length > 0 && notesPages.some((page) => page.id === activePageIdRaw)
        ? activePageIdRaw
        : notesPages[0]?.id || "";
    const updatedAt = typeof data?.updated_at === "string" ? data.updated_at : null;

    return NextResponse.json({
      notesPages,
      activePageId,
      updatedAt,
    });
  } catch (error) {
    console.error("Notes GET error", error);
    return NextResponse.json({ error: "Failed to load notes" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const paid = await hasPaidAccess(authData.user.id);
    if (!paid) {
      return NextResponse.json(
        { error: "Read-only mode: resume plan to edit notes. Existing notes remain safe." },
        { status: 402 }
      );
    }

    const body = await request.json().catch(() => null);
    const notesPages = sanitizeNotes(body?.notesPages);
    if (!notesPages) {
      return NextResponse.json({ error: "Invalid notes payload" }, { status: 400 });
    }

    const activePageCandidate = typeof body?.activePageId === "string" ? body.activePageId.trim() : "";
    const activePageId =
      notesPages.length > 0 && notesPages.some((page) => page.id === activePageCandidate)
        ? activePageCandidate
        : notesPages[0]?.id || "";

    const userId = authData.user.id;
    await ensureUserRow(userId, authData.user.email);

    const { error: upsertError } = await supabaseAdmin
      .from("user_notes")
      .upsert(
        {
          user_id: userId,
          notes_pages: notesPages,
          active_page_id: activePageId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      if (isMissingUserNotesTableError(upsertError)) {
        return NextResponse.json({
          ok: true,
          localOnly: true,
          notesPages,
          activePageId,
        });
      }
      console.error("Failed to save notes", upsertError);
      return NextResponse.json({ error: "Failed to save notes" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      notesPages,
      activePageId,
    });
  } catch (error) {
    console.error("Notes PUT error", error);
    return NextResponse.json({ error: "Failed to save notes" }, { status: 500 });
  }
}
