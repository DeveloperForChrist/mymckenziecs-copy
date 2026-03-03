"use client";

interface NotePageDraft {
  id: string;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

interface GlobalLocalDraftPayload {
  notesPages: NotePageDraft[];
  activePageId: string;
  savedAt?: string;
  ownerUid?: string;
}

interface FlushNotesDraftResult {
  localSaved: boolean;
  serverSynced: boolean;
  reason?: string;
}

const normalizeDraftPages = (pages: NotePageDraft[]): NotePageDraft[] =>
  pages.map((note) => ({
    ...note,
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || new Date().toISOString(),
  }));

const FALLBACK_LOCAL_DRAFT_KEY = "mynotes-draft:last-local";

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  if (timeoutMs <= 0) return promise;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), timeoutMs);
    }),
  ]);
};

export async function flushNotesDraftNow(
  userId: string | null | undefined,
  options?: { timeoutMs?: number }
): Promise<FlushNotesDraftResult> {
  if (!userId || typeof window === "undefined") {
    return { localSaved: false, serverSynced: false, reason: "no-user-or-window" };
  }

  const globalKey = `mynotes-draft:${userId}:local`;
  const userRaw = window.localStorage.getItem(globalKey);
  const fallbackRaw = window.localStorage.getItem(FALLBACK_LOCAL_DRAFT_KEY);
  const raw = userRaw || fallbackRaw;
  if (!raw) {
    return { localSaved: false, serverSynced: false, reason: "no-local-draft" };
  }

  let parsed: GlobalLocalDraftPayload;
  try {
    parsed = JSON.parse(raw) as GlobalLocalDraftPayload;
  } catch {
    return { localSaved: false, serverSynced: false, reason: "invalid-local-draft" };
  }

  if (parsed.ownerUid && parsed.ownerUid !== userId) {
    return { localSaved: false, serverSynced: false, reason: "draft-owner-mismatch" };
  }

  if (!Array.isArray(parsed?.notesPages) || parsed.notesPages.length === 0 || typeof parsed.activePageId !== "string") {
    return { localSaved: false, serverSynced: false, reason: "invalid-local-draft-shape" };
  }

  const normalizedPages = normalizeDraftPages(parsed.notesPages);
  const activePageId = normalizedPages.some((page) => page.id === parsed.activePageId)
    ? parsed.activePageId
    : normalizedPages[0].id;

  const refreshedDraft: GlobalLocalDraftPayload = {
    notesPages: normalizedPages,
    activePageId,
    ownerUid: userId,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(globalKey, JSON.stringify(refreshedDraft));
  window.localStorage.setItem(FALLBACK_LOCAL_DRAFT_KEY, JSON.stringify(refreshedDraft));

  const payload = JSON.stringify({
    notesPages: normalizedPages,
    activePageId,
  });

  try {
    const syncPromise = fetch("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: payload,
    });
    const response = await withTimeout(syncPromise, options?.timeoutMs ?? 2500);
    if (!response.ok) {
      return { localSaved: true, serverSynced: false, reason: `sync-status-${response.status}` };
    }

    return { localSaved: true, serverSynced: true };
  } catch (error) {
    console.error("Failed to sync notes draft before sign out", error);
    return { localSaved: true, serverSynced: false, reason: "sync-failed" };
  }
}
