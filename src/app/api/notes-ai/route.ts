import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createSupabaseRouteClient } from "@/lib/database/supabase-route";
import { supabaseAdmin } from "@/lib/database/supabase-server";
import { hasReminderAccess } from "@/lib/plans/access";
import {
  aiIpRateLimiter,
  aiRateLimiter,
  getClientIp,
  getIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

let cachedOpenAI: OpenAI | null = null;

const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  cachedOpenAI ??= new OpenAI({ apiKey });
  return cachedOpenAI;
};

const requestSchema = z.object({
  mode: z.enum(["summary", "calendar_extract"]),
  noteTitle: z.string().optional(),
  noteContent: z.string().min(1).max(18000),
});

const summarySchema = z.object({
  summary: z.string().min(12).max(2000),
  actionItems: z.array(z.string().min(2).max(240)).max(8).default([]),
  keyRisks: z.array(z.string().min(2).max(240)).max(6).default([]),
});

const extractedEventSchema = z.object({
  title: z.string().min(2).max(180),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  category: z.enum(["deadline", "hearing", "meeting", "reminder", "other"]).default("deadline"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  notes: z.string().max(1000).nullable().optional(),
});

const extractedEventsSchema = z.object({
  events: z.array(extractedEventSchema).max(12).default([]),
});

function parseJsonFromModelOutput(content: string): any {
  const raw = content.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // Continue to object extraction fallback.
      }
    }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

function fallbackExtractDates(noteContent: string) {
  const pattern = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
  const now = new Date();
  const seen = new Set<string>();
  const events: Array<z.infer<typeof extractedEventSchema>> = [];

  for (const match of noteContent.matchAll(pattern)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (!day || !month || !year) continue;

    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) continue;
    if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) continue;

    const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (seen.has(isoDate)) continue;
    seen.add(isoDate);

    events.push({
      title: `Deadline mentioned in note (${isoDate})`,
      date: isoDate,
      time: null,
      category: "deadline",
      priority: date.getTime() < now.getTime() ? "high" : "medium",
      notes: null,
    });
    if (events.length >= 8) break;
  }

  return events;
}

async function hasNotesAiAccess(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_type, status")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return hasReminderAccess(data?.plan_type);
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }

    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const hasAccess = await hasNotesAiAccess(authData.user.id);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "This feature is available on Premium and Premium Plus plans." },
        { status: 402 }
      );
    }

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const ip = getClientIp(request.headers);
    const identifier = `ai:notes:${payload.data.mode}:${getIdentifier(authData.user.id, ip)}`;
    const userLimit = await rateLimit(aiRateLimiter, identifier, 10, 60 * 1000);
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, "Too many notes AI requests. Please try again shortly.");
    }
    if (ip) {
      const ipLimit = await rateLimit(aiIpRateLimiter, `ai:notes:ip:${ip}`, 80, 10 * 60 * 1000);
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, "Too many requests from this network. Please try again later.");
      }
    }

    const noteTitle = payload.data.noteTitle?.trim() || "Untitled note";
    const noteContent = payload.data.noteContent.trim();

    if (payload.data.mode === "summary") {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "You summarise legal notes for self-represented court users. Return JSON only with fields: summary (string), actionItems (array of strings), keyRisks (array of strings). Keep concise and factual. Never provide legal advice.",
          },
          {
            role: "user",
            content: `Summarise this note in plain English and list concrete next actions and practical watch-outs.\n\nTitle: ${noteTitle}\n\nNote:\n${noteContent}`,
          },
        ],
      });

      const modelText = completion.choices[0]?.message?.content || "";
      const parsedModel = parseJsonFromModelOutput(modelText);
      const parsedSummary = summarySchema.safeParse(parsedModel);

      if (parsedSummary.success) {
        return NextResponse.json({
          success: true,
          summary: parsedSummary.data.summary,
          actionItems: parsedSummary.data.actionItems,
          keyRisks: parsedSummary.data.keyRisks,
        });
      }

      return NextResponse.json({
        success: true,
        summary: noteContent.slice(0, 420),
        actionItems: [],
        keyRisks: [],
      });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            "Extract only concrete calendar events from notes. Return JSON only with a top-level `events` array. Every event must include: title, date (YYYY-MM-DD), time (HH:mm or null), category (deadline|hearing|meeting|reminder|other), priority (low|medium|high), notes (string or null). Omit vague or unknown dates.",
        },
        {
          role: "user",
          content: `Today is ${todayIso}. Extract calendar events from the note below.\n\nTitle: ${noteTitle}\n\nNote:\n${noteContent}`,
        },
      ],
    });

    const modelText = completion.choices[0]?.message?.content || "";
    const parsedModel = parseJsonFromModelOutput(modelText);
    const parsedEvents = extractedEventsSchema.safeParse(parsedModel);
    const events = parsedEvents.success ? parsedEvents.data.events : fallbackExtractDates(noteContent);

    const validEvents = events
      .filter((event) => isValidIsoDate(event.date))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({
      success: true,
      events: validEvents,
    });
  } catch (error) {
    console.error("Notes AI route error:", error);
    return NextResponse.json({ error: "Failed to process note AI request" }, { status: 500 });
  }
}
