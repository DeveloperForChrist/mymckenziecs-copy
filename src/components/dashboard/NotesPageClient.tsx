"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/database/supabase-browser";
import { getPlanTier } from "@/lib/plans/access";
import { getAppMarketFromPathname, getAppRouteForMarket } from "@/lib/markets/app-routes";
import styles from "./notes-page.module.css";
import WorkspaceLoadingState from "@/components/business/WorkspaceLoadingState";

interface NotePage {
  id: string;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

interface NoteSummary {
  summary: string;
  actionItems: string[];
  keyRisks: string[];
}

interface ExtractedCalendarEvent {
  title: string;
  date: string;
  time: string | null;
  category: "deadline" | "hearing" | "meeting" | "reminder" | "other";
  priority: "low" | "medium" | "high";
  notes: string | null;
}

interface LocalDraftPayload {
  notesPages: NotePage[];
  activePageId: string;
  savedAt: string;
}

interface GlobalLocalDraftPayload extends LocalDraftPayload {
  ownerUid?: string;
}

interface ServerNotesPayload {
  notesPages: NotePage[];
  activePageId: string;
  updatedAt?: string;
}

const NOTES_READ_ONLY_MESSAGE = "Read-only mode: resume plan to edit notes. Existing notes remain safe.";
const FALLBACK_LOCAL_DRAFT_KEY = "mynotes-draft:last-local";

type NotesPageClientProps = {
  initialAuthUid?: string | null;
  initialReadOnlyMode?: boolean;
  initialReadOnlyMessage?: string | null;
  dashboardHrefOverride?: string;
};

export default function NotesPageClient({
  initialAuthUid = null,
  initialReadOnlyMode = false,
  initialReadOnlyMessage = null,
  dashboardHrefOverride,
}: NotesPageClientProps = {}) {
  const pathname = usePathname();
  const [authUid, setAuthUid] = useState<string | null>(initialAuthUid);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [notesHydrated, setNotesHydrated] = useState(false);
  const [readOnlyMode, setReadOnlyMode] = useState(Boolean(initialReadOnlyMode));
  const [readOnlyMessage, setReadOnlyMessage] = useState<string | null>(initialReadOnlyMessage);

  const [notesPages, setNotesPages] = useState<NotePage[]>([]);
  const [activePageId, setActivePageId] = useState("");
  const activePage = useMemo(() => notesPages.find(p => p.id === activePageId), [notesPages, activePageId]);

  const [saving, setSaving] = useState<"saved" | "saving" | "error">("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");
  const latestDraftRef = useRef<{
    authUid: string | null;
    notesPages: NotePage[];
    activePageId: string;
  }>({
    authUid: null,
    notesPages: [],
    activePageId: "",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const [isSummarising, setIsSummarising] = useState(false);
  const [summaryResult, setSummaryResult] = useState<NoteSummary | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<string | null>(null);
  const [isExtractingDates, setIsExtractingDates] = useState(false);
  const [extractStatus, setExtractStatus] = useState<string | null>(null);
  const [extractedEvents, setExtractedEvents] = useState<ExtractedCalendarEvent[]>([]);
  const [isSavingExtractedEvents, setIsSavingExtractedEvents] = useState(false);
  const [canUseAiActions, setCanUseAiActions] = useState(false);
  const dashboardHref = dashboardHrefOverride || getAppRouteForMarket('/dashboard', getAppMarketFromPathname(pathname));

  const globalDraftStorageKey = useCallback((uid: string) => `mynotes-draft:${uid}:local`, []);
  const normalizeDraftPages = useCallback(
    (pages: any[]): NotePage[] =>
      pages.map((note: any) => ({
        ...note,
        createdAt: note.createdAt || new Date().toISOString(),
        updatedAt: note.updatedAt || new Date().toISOString(),
      })),
    []
  );

  const saveNotesToServer = useCallback(
    async (
      pages: NotePage[],
      activeId: string,
      payload: string,
      options?: { keepalive?: boolean; updateStatus?: boolean }
    ) => {
      const updateStatus = options?.updateStatus !== false;
      try {
        const response = await fetch("/api/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          keepalive: options?.keepalive,
          body: JSON.stringify({
            notesPages: pages,
            activePageId: activeId,
          }),
        });

        if (response.status === 402) {
          const data = await response.json().catch(() => ({} as Record<string, any>));
          const lockedMessage =
            typeof data.error === "string" && data.error.trim().length > 0
              ? data.error
              : NOTES_READ_ONLY_MESSAGE;
          setReadOnlyMode(true);
          setReadOnlyMessage(lockedMessage);
          if (updateStatus) {
            setSaving("saved");
          }
          return false;
        }

        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        lastSavedRef.current = payload;
        if (updateStatus) {
          setSaving("saved");
        }
        return true;
      } catch (error) {
        console.error("Failed to save notes", error);
        if (updateStatus) {
          setSaving("error");
        }
        return false;
      }
    },
    []
  );

  const loadNotesFromServer = useCallback(async (): Promise<ServerNotesPayload | null> => {
    try {
      const response = await fetch("/api/notes", { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as Partial<ServerNotesPayload>;
      if (!Array.isArray(data?.notesPages) || data.notesPages.length === 0 || typeof data.activePageId !== "string") {
        return null;
      }
      const normalizedPages = normalizeDraftPages(data.notesPages);
      const normalizedActivePageId = normalizedPages.some((page) => page.id === data.activePageId)
        ? data.activePageId
        : normalizedPages[0].id;
      return {
        notesPages: normalizedPages,
        activePageId: normalizedActivePageId,
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
      };
    } catch (error) {
      console.error("Failed to load notes from server", error);
      return null;
    }
  }, [normalizeDraftPages]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setAuthUid(data?.user?.id || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUid(session?.user?.id || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    latestDraftRef.current = {
      authUid,
      notesPages,
      activePageId,
    };
  }, [authUid, notesPages, activePageId]);

  useEffect(() => {
    let cancelled = false;

    const loadNotes = async () => {
      if (!authUid || typeof window === "undefined") {
        if (!cancelled) {
          setLoadingNotes(false);
          setNotesHydrated(false);
        }
        return;
      }

      setLoadingNotes(true);
      setNotesHydrated(false);
      lastSavedRef.current = "";

      let localDraft: GlobalLocalDraftPayload | null = null;
      try {
        const draftCandidates: GlobalLocalDraftPayload[] = [];
        const ownDraftRaw = window.localStorage.getItem(globalDraftStorageKey(authUid));
        const fallbackDraftRaw = window.localStorage.getItem(FALLBACK_LOCAL_DRAFT_KEY);

        if (ownDraftRaw) {
          const parsed = JSON.parse(ownDraftRaw) as GlobalLocalDraftPayload;
          if (Array.isArray(parsed?.notesPages) && parsed.notesPages.length > 0 && typeof parsed.activePageId === "string") {
            draftCandidates.push(parsed);
          }
        }

        if (fallbackDraftRaw) {
          const parsed = JSON.parse(fallbackDraftRaw) as GlobalLocalDraftPayload;
          if (
            Array.isArray(parsed?.notesPages) &&
            parsed.notesPages.length > 0 &&
            typeof parsed.activePageId === "string" &&
            (!parsed.ownerUid || parsed.ownerUid === authUid)
          ) {
            draftCandidates.push(parsed);
          }
        }

        if (draftCandidates.length > 0) {
          localDraft = draftCandidates.reduce((latest, candidate) => {
            const latestTs = latest?.savedAt ? new Date(latest.savedAt).getTime() : 0;
            const candidateTs = candidate?.savedAt ? new Date(candidate.savedAt).getTime() : 0;
            return candidateTs > latestTs ? candidate : latest;
          }, draftCandidates[0]);
        }
      } catch (error) {
        console.error("Failed to restore local notes", error);
      }

      const serverDraft = await loadNotesFromServer();
      if (cancelled) return;

      const localSavedAt = localDraft?.savedAt ? new Date(localDraft.savedAt).getTime() : 0;
      const serverSavedAt = serverDraft?.updatedAt ? new Date(serverDraft.updatedAt).getTime() : 0;
      const shouldUseLocal = Boolean(localDraft) && (!serverDraft || localSavedAt >= serverSavedAt);
      const sourceDraft = shouldUseLocal ? localDraft : serverDraft;

      if (sourceDraft && Array.isArray(sourceDraft.notesPages) && sourceDraft.notesPages.length > 0) {
        const normalizedDraftNotes = normalizeDraftPages(sourceDraft.notesPages);
        const normalizedActivePageId = normalizedDraftNotes.some((page: any) => page.id === sourceDraft.activePageId)
          ? sourceDraft.activePageId
          : normalizedDraftNotes[0].id;

        setNotesPages(normalizedDraftNotes);
        setActivePageId(normalizedActivePageId);
        lastSavedRef.current = JSON.stringify({
          notesPages: normalizedDraftNotes,
          activePageId: normalizedActivePageId,
        });
      }

      setSaving("saved");
      setLoadingNotes(false);
      setNotesHydrated(true);
    };

    void loadNotes();

    return () => {
      cancelled = true;
    };
  }, [authUid, globalDraftStorageKey, loadNotesFromServer, normalizeDraftPages]);

  useEffect(() => {
    if (!notesHydrated || !authUid || !notesPages.length || !activePageId || typeof window === "undefined") return;
    try {
      const localDraft: GlobalLocalDraftPayload = {
        notesPages,
        activePageId,
        ownerUid: authUid,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(globalDraftStorageKey(authUid), JSON.stringify(localDraft));
      window.localStorage.setItem(FALLBACK_LOCAL_DRAFT_KEY, JSON.stringify(localDraft));
    } catch (error) {
      console.error("Failed to persist local notes", error);
    }
  }, [notesHydrated, authUid, notesPages, activePageId, globalDraftStorageKey]);

  useEffect(() => {
    let cancelled = false;
    if (!authUid) return;

    const loadPlanAccess = async () => {
      try {
        const response = await fetch("/api/user/plan", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { paidAccess?: boolean; platformAccess?: boolean; plan?: string };
        if (cancelled) return;
        const hasPlatformAccess = Boolean(data?.platformAccess ?? data?.paidAccess);
        if (!hasPlatformAccess) {
          setReadOnlyMode(true);
          setReadOnlyMessage(NOTES_READ_ONLY_MESSAGE);
          setCanUseAiActions(false);
          return;
        }
        const tier = getPlanTier(data?.plan);
        setCanUseAiActions(tier === "premium" || tier === "premium_plus");
        setReadOnlyMode(false);
        setReadOnlyMessage(null);
      } catch {
        // Keep existing mode if plan check fails.
      }
    };

    void loadPlanAccess();

    return () => {
      cancelled = true;
    };
  }, [authUid]);

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (!notesHydrated || !authUid || !notesPages.length || !activePageId) return;
    if (readOnlyMode) {
      if (saving !== "saved") {
        setSaving("saved");
      }
      return;
    }

    const payload = JSON.stringify({ notesPages, activePageId });
    if (payload === lastSavedRef.current) {
      if (saving !== "saved") {
        setSaving("saved");
      }
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaving("saving");
    saveTimeoutRef.current = setTimeout(async () => {
      await saveNotesToServer(notesPages, activePageId, payload, {
        keepalive: true,
      });
    }, 250);
  }, [notesHydrated, authUid, notesPages, activePageId, readOnlyMode, saving, saveNotesToServer]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const flushPendingSave = () => {
      if (!notesHydrated) return;
      if (!saveTimeoutRef.current) return;
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;

      const snapshot = latestDraftRef.current;
      if (!snapshot.authUid || !snapshot.notesPages.length || !snapshot.activePageId || readOnlyMode) {
        return;
      }

      const payload = JSON.stringify({
        notesPages: snapshot.notesPages,
        activePageId: snapshot.activePageId,
      });
      if (payload === lastSavedRef.current) return;

      void saveNotesToServer(
        snapshot.notesPages,
        snapshot.activePageId,
        payload,
        { keepalive: true, updateStatus: false }
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingSave();
      }
    };

    window.addEventListener("pagehide", flushPendingSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushPendingSave);
      flushPendingSave();
    };
  }, [notesHydrated, readOnlyMode, saveNotesToServer]);

  const onChangeTitle = useCallback((val: string) => {
    if (readOnlyMode) return;
    setSaving("saving");
    setNotesPages(prev => prev.map(p => 
      p.id === activePageId ? { ...p, title: val, updatedAt: new Date().toISOString() } : p
    ));
  }, [activePageId, readOnlyMode]);

  const onChangeContent = useCallback((val: string) => {
    if (readOnlyMode) return;
    setSaving("saving");
    setNotesPages(prev => prev.map(p => 
      p.id === activePageId ? { ...p, content: val, updatedAt: new Date().toISOString() } : p
    ));
  }, [activePageId, readOnlyMode]);

  const appendToActiveNote = useCallback((snippet: string) => {
    if (readOnlyMode) return;
    const cleanSnippet = snippet.trim();
    if (!cleanSnippet) return;

    setSaving("saving");
    setNotesPages(prev => prev.map(page => {
      if (page.id !== activePageId) return page;
      const currentContent = page.content.trimEnd();
      return {
        ...page,
        content: currentContent ? `${currentContent}\n${cleanSnippet}` : cleanSnippet,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, [activePageId, readOnlyMode]);

  const addPage = () => {
    if (readOnlyMode) return;
    const id = `p${Date.now()}`;
    const now = new Date().toISOString();
    const page: NotePage = { 
      id, 
      title: "Untitled note", 
      content: "", 
      createdAt: now, 
      updatedAt: now 
    };
    setNotesPages(prev => [page, ...prev]);
    setActivePageId(id);
  };

  const confirmDeletePage = () => {
    if (readOnlyMode) return;
    if (!pendingDeleteNoteId) return;
    setNotesPages(prev => {
      const idx = prev.findIndex(p => p.id === pendingDeleteNoteId);
      const next = prev.filter(p => p.id !== pendingDeleteNoteId);
      const newActive = next[Math.max(0, idx - 1)]?.id || next[0]?.id;
      setActivePageId(newActive || "");
      return next;
    });
    setDeleteModalOpen(false);
    setPendingDeleteNoteId(null);
  };

  const summariseActiveNote = useCallback(async () => {
    if (!canUseAiActions) {
      setSummaryStatus("Summarise is available on Premium and Premium Plus plans.");
      return;
    }
    if (!activePage) return;
    if (!activePage.content.trim()) {
      setSummaryStatus("Add some note content first, then run summary.");
      return;
    }

    try {
      setIsSummarising(true);
      setSummaryStatus(null);
      const response = await fetch("/api/notes-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summary",
          noteTitle: activePage.title,
          noteContent: activePage.content,
        }),
      });
      const data = await response.json().catch(() => ({} as Record<string, any>));
      if (!response.ok) {
        const errorMessage = typeof data.error === "string" ? data.error : "Failed to summarise note.";
        throw new Error(errorMessage);
      }

      setSummaryResult({
        summary: typeof data.summary === "string" ? data.summary : "",
        actionItems: Array.isArray(data.actionItems)
          ? data.actionItems.filter((item: any): item is string => typeof item === "string")
          : [],
        keyRisks: Array.isArray(data.keyRisks)
          ? data.keyRisks.filter((item: any): item is string => typeof item === "string")
          : [],
      });
      setSummaryStatus("Summary ready.");
    } catch (error) {
      console.error("Summary failed", error);
      setSummaryStatus(error instanceof Error ? error.message : "Failed to summarise note.");
    } finally {
      setIsSummarising(false);
    }
  }, [activePage, canUseAiActions]);

  const addSummaryToNote = useCallback(() => {
    if (!summaryResult) return;
    const sections: string[] = [
      "",
      "AI summary",
      summaryResult.summary,
    ];
    if (summaryResult.actionItems.length > 0) {
      sections.push("", "Next actions:");
      summaryResult.actionItems.forEach((item, index) => {
        sections.push(`${index + 1}. ${item}`);
      });
    }
    if (summaryResult.keyRisks.length > 0) {
      sections.push("", "Watch-outs:");
      summaryResult.keyRisks.forEach((risk, index) => {
        sections.push(`${index + 1}. ${risk}`);
      });
    }
    appendToActiveNote(sections.join("\n"));
    setSummaryStatus("Summary inserted into your note.");
  }, [appendToActiveNote, summaryResult]);

  const extractDatesFromNote = useCallback(async () => {
    if (!canUseAiActions) {
      setExtractStatus("Extract Dates is available on Premium and Premium Plus plans.");
      return;
    }
    if (!activePage) return;
    if (!activePage.content.trim()) {
      setExtractStatus("Add note content first, then extract dates.");
      return;
    }

    try {
      setIsExtractingDates(true);
      setExtractStatus(null);
      const response = await fetch("/api/notes-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "calendar_extract",
          noteTitle: activePage.title,
          noteContent: activePage.content,
        }),
      });
      const data = await response.json().catch(() => ({} as Record<string, any>));
      if (!response.ok) {
        const errorMessage = typeof data.error === "string" ? data.error : "Failed to extract dates.";
        throw new Error(errorMessage);
      }

      const events = Array.isArray(data.events) ? (data.events as any[]) : [];
      const parsedEvents: ExtractedCalendarEvent[] = events
        .map((event: any) => {
          const item = event as Record<string, any>;
          const category: ExtractedCalendarEvent["category"] =
            item.category === "hearing" || item.category === "meeting" || item.category === "reminder" || item.category === "other"
              ? item.category
              : "deadline";
          const priority: ExtractedCalendarEvent["priority"] =
            item.priority === "low" || item.priority === "high" ? item.priority : "medium";
          return {
            title: typeof item.title === "string" ? item.title : "",
            date: typeof item.date === "string" ? item.date : "",
            time: typeof item.time === "string" ? item.time : null,
            category,
            priority,
            notes: typeof item.notes === "string" ? item.notes : null,
          };
        })
        .filter((event: ExtractedCalendarEvent) => Boolean(event.title) && /^\d{4}-\d{2}-\d{2}$/.test(event.date));

      setExtractedEvents(parsedEvents);
      if (parsedEvents.length === 0) {
        setExtractStatus("No clear calendar dates found in this note yet.");
      } else {
        setExtractStatus(`Found ${parsedEvents.length} date${parsedEvents.length === 1 ? "" : "s"} to review.`);
      }
    } catch (error) {
      console.error("Date extraction failed", error);
      setExtractStatus(error instanceof Error ? error.message : "Failed to extract dates.");
    } finally {
      setIsExtractingDates(false);
    }
  }, [activePage, canUseAiActions]);

  const saveExtractedEvents = useCallback(async () => {
    if (extractedEvents.length === 0) return;
    try {
      setIsSavingExtractedEvents(true);
      const results = await Promise.all(extractedEvents.map(async (event) => {
        try {
          const response = await fetch("/api/calendar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: event.title,
              notes: event.notes,
              date: event.date,
              time: event.time,
              category: event.category,
              priority: event.priority,
              type: "notes_extracted",
              repeat: "none",
            }),
          });
          const payload = await response.json().catch(() => ({} as Record<string, any>));
          if (!response.ok) {
            const errorMessage = typeof payload.error === "string" ? payload.error : "Failed to create calendar event";
            return { ok: false, error: errorMessage };
          }
          return { ok: true as const };
        } catch {
          return { ok: false, error: "Network error while saving calendar event" };
        }
      }));

      const failedIndexes = results
        .map((result, index) => (result.ok ? -1 : index))
        .filter((index) => index >= 0);
      const successCount = results.length - failedIndexes.length;
      if (successCount > 0) {
        setExtractedEvents(prev => prev.filter((_, index) => failedIndexes.includes(index)));
      }

      if (successCount > 0 && failedIndexes.length === 0) {
        setExtractStatus(`Added ${successCount} calendar event${successCount === 1 ? "" : "s"}.`);
      } else if (successCount > 0) {
        setExtractStatus(`Added ${successCount} event${successCount === 1 ? "" : "s"}, ${failedIndexes.length} still need saving.`);
      } else {
        setExtractStatus("No events were saved. Please try again.");
      }
    } finally {
      setIsSavingExtractedEvents(false);
    }
  }, [extractedEvents]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-GB', { weekday: 'long' });
    } else {
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  };

  const getPreview = (content: string) => {
    const cleaned = content.replace(/\n/g, ' ').trim();
    return cleaned.length > 100 ? cleaned.slice(0, 100) + '...' : cleaned;
  };

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notesPages;
    const query = searchQuery.toLowerCase();
    return notesPages.filter(note => 
      note.title.toLowerCase().includes(query) || 
      note.content.toLowerCase().includes(query)
    );
  }, [notesPages, searchQuery]);

  const caseLabel = "Saved to your account.";

  return (
    <div className={styles.notesApp}>
      {/* Combined Sidebar with Notes List */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div 
            className={styles.searchBox}
            onClick={() => setIsSearching(true)}
          >
            <i className="bx bx-search" />
            {isSearching ? (
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => !searchQuery && setIsSearching(false)}
                autoFocus
                className={styles.searchInput}
              />
            ) : (
              <span>Search</span>
            )}
          </div>
          <button className={styles.newNoteBtn} onClick={addPage} disabled={readOnlyMode}>
            <i className="bx bx-plus" />
            <span>New Note</span>
          </button>
        </div>

        <div className={styles.notesListTitle}>
          <h2>My Notes</h2>
        </div>

        <div className={styles.notesListContent}>
          {loadingNotes ? (
            <WorkspaceLoadingState variant="panel" label="Loading notes..." className={styles.emptyState} />
          ) : filteredNotes.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="bx bx-note" />
              <h3>No notes yet</h3>
              <p>Click &quot;New Note&quot; to start writing.</p>
            </div>
          ) : (
            filteredNotes.map(note => (
              <div
                key={note.id}
                className={`${styles.noteCard} ${note.id === activePageId ? styles.active : ''}`}
                onClick={() => setActivePageId(note.id)}
              >
                <div className={styles.noteCardHeader}>
                  <div className={styles.noteCardTitle}>
                    {note.title || 'Untitled note'}
                  </div>
                  <button 
                    className={styles.noteDeleteBtn}
                    disabled={readOnlyMode}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (readOnlyMode) return;
                      if (notesPages.length <= 1) return;
                      setPendingDeleteNoteId(note.id);
                      setDeleteModalOpen(true);
                    }}
                    title="Delete note"
                  >
                    <i className="bx bx-trash" />
                  </button>
                </div>
                <div className={styles.noteCardPreview}>
                  {getPreview(note.content) || 'No content'}
                </div>
                <div className={styles.noteCardMeta}>
                  <span className={styles.noteCardDate}>
                    {formatDate(note.updatedAt)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.sidebarFooter}>
          <a href={dashboardHref} className={styles.dashboardLink}>
            <span>Go to Dashboard</span>
          </a>
        </div>
      </aside>

      {/* Note Editor Panel */}
      <div className={styles.noteEditor}>
        {activePage ? (
          <>
            <div className={styles.editorHeader}>
              <div className={styles.editorHeaderCopy}>
                <h1 className={styles.editorTitle}>MyNotes</h1>
                <p className={styles.editorContext}>{caseLabel}</p>
                {readOnlyMode && (
                  <p className={styles.readOnlyBanner}>{readOnlyMessage || NOTES_READ_ONLY_MESSAGE}</p>
                )}
              </div>
              {canUseAiActions && (
                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={summariseActiveNote}
                    disabled={isSummarising}
                  >
                    {isSummarising ? "Summarising..." : "Summarise"}
                  </button>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={extractDatesFromNote}
                    disabled={isExtractingDates}
                  >
                    {isExtractingDates ? "Extracting..." : "Extract Dates"}
                  </button>
                </div>
              )}
            </div>

            <div className={styles.editorContent}>
              <input
                type="text"
                className={styles.noteTitle}
                value={activePage.title}
                readOnly={readOnlyMode}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder="Note title"
              />
              
              <textarea
                className={styles.noteBody}
                value={activePage.content}
                readOnly={readOnlyMode}
                onChange={(e) => onChangeContent(e.target.value)}
                placeholder="Start writing your note..."
              />

              {summaryResult && (
                <div className={styles.helperCard}>
                  <div className={styles.helperCardHeader}>
                    <div className={styles.helperCardTitle}>
                      <i className="bx bx-align-left" />
                      <span>AI Summary</span>
                    </div>
                    <button
                      type="button"
                      className={styles.helperCloseButton}
                      onClick={() => {
                        setSummaryResult(null);
                        setSummaryStatus(null);
                      }}
                      aria-label="Close AI summary"
                      title="Close summary"
                    >
                      <i className="bx bx-x" />
                    </button>
                  </div>
                  <p className={styles.helperCardText}>{summaryResult.summary}</p>
                  {summaryResult.actionItems.length > 0 && (
                    <div>
                      <p className={styles.helperSubheading}>Next actions</p>
                      <ul className={styles.helperList}>
                        {summaryResult.actionItems.map((item, index) => (
                          <li key={`summary-action-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summaryResult.keyRisks.length > 0 && (
                    <div>
                      <p className={styles.helperSubheading}>Watch-outs</p>
                      <ul className={styles.helperList}>
                        {summaryResult.keyRisks.map((risk, index) => (
                          <li key={`summary-risk-${index}`}>{risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className={styles.helperActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={addSummaryToNote}
                      disabled={readOnlyMode}
                    >
                      Add to Note
                    </button>
                  </div>
                </div>
              )}

              {extractedEvents.length > 0 && (
                <div className={styles.helperCard}>
                  <div className={styles.helperCardTitle}>
                    <i className="bx bx-calendar-event" />
                    <span>Extracted Dates</span>
                  </div>
                  <ul className={styles.eventList}>
                    {extractedEvents.map((event, index) => (
                      <li key={`${event.date}-${event.title}-${index}`} className={styles.eventListItem}>
                        <div>
                          <p className={styles.eventTitle}>{event.title}</p>
                          <p className={styles.eventMeta}>
                            {event.date}
                            {event.time ? ` at ${event.time}` : ""}
                            {" · "}
                            {event.category}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={styles.eventRemoveButton}
                          onClick={() => {
                            setExtractedEvents((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                          }}
                          aria-label="Remove extracted date"
                          title="Remove"
                        >
                          <i className="bx bx-x" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.helperActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={saveExtractedEvents}
                      disabled={isSavingExtractedEvents || readOnlyMode}
                    >
                      {isSavingExtractedEvents ? "Saving..." : "Save to Calendar"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.editorFooter}>
              <div className={styles.aiStatus}>
                {summaryStatus && <p className={styles.aiStatusText}>{summaryStatus}</p>}
                {extractStatus && <p className={styles.aiStatusText}>{extractStatus}</p>}
              </div>
              <div className={styles.saveStatus}>
                <span 
                  className={`${styles.saveStatusDot} ${saving === 'saving' ? styles.saving : ''} ${saving === 'error' ? styles.error : ''}`}
                />
                {readOnlyMode
                  ? "Read-only mode"
                  : saving === "saving"
                  ? "Saving..."
                  : saving === "error"
                  ? "Save failed"
                  : "All changes saved"}
              </div>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <i className="bx bx-note" />
            <h3>Select a note</h3>
            <p>Choose a note from the list or create a new one</p>
          </div>
        )}
      </div>

      {deleteModalOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Delete this note?</h3>
            <p className={styles.modalBody}>This action cannot be undone.</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalButtonSecondary}
                onClick={() => {
                  setDeleteModalOpen(false);
                  setPendingDeleteNoteId(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className={styles.modalButtonDanger} onClick={confirmDeletePage}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
