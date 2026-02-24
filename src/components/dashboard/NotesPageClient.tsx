"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/database/supabase-browser";
import styles from "./notes-page.module.css";

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

export default function NotesPageClient() {
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [availableCases, setAvailableCases] = useState<any[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [loadingCases, setLoadingCases] = useState(true);
  const [hasCase, setHasCase] = useState(false);

  const [notesPages, setNotesPages] = useState<NotePage[]>([
    { id: "p1", title: "Overview", content: "Key facts and timeline...", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "p2", title: "Evidence", content: "Photos, emails, inspection reports...", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ]);
  const [activePageId, setActivePageId] = useState("p1");
  const activePage = useMemo(() => notesPages.find(p => p.id === activePageId), [notesPages, activePageId]);

  const [saving, setSaving] = useState<"saved" | "saving" | "error">("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");

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

  const fetchCases = useCallback(async () => {
    try {
      if (!authUid) {
        setAvailableCases([]);
        setHasCase(false);
        setLoadingCases(false);
        return;
      }
      setLoadingCases(true);
      const response = await fetch('/api/cases');
      if (!response.ok) {
        throw new Error('Failed to fetch cases');
      }
      const data = await response.json();
      const cases = data.cases || [];

      setAvailableCases(cases);
      setHasCase(cases.length > 0);

      // Do not auto-select a case. Let the user choose or rely on a saved case profile.
      if (cases.length === 0) {
        setSelectedCaseId('');
      }
    } catch (error) {
      console.error('Error fetching cases:', error);
      setHasCase(false);
    } finally {
      setLoadingCases(false);
    }
  }, [authUid]);

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
    void fetchCases();
  }, [authUid, fetchCases]);

  useEffect(() => {
    const selected = availableCases.find(c => c.id === selectedCaseId);
    if (selected) {
      const storedNotes = Array.isArray(selected.notesPages) ? selected.notesPages : null;
      const storedActive = typeof selected.notesActiveId === 'string' ? selected.notesActiveId : null;
      if (storedNotes && storedNotes.length > 0) {
        setNotesPages(storedNotes.map((note: any) => ({
          ...note,
          createdAt: note.createdAt || new Date().toISOString(),
          updatedAt: note.updatedAt || new Date().toISOString()
        })));
        if (storedActive && storedNotes.find((page: any) => page.id === storedActive)) {
          setActivePageId(storedActive);
        } else {
          setActivePageId(storedNotes[0].id);
        }
        lastSavedRef.current = JSON.stringify({
          notesPages: storedNotes,
          activePageId: storedActive && storedNotes.find((page: any) => page.id === storedActive)
            ? storedActive
            : storedNotes[0].id
        });
      }
    }
  }, [selectedCaseId, availableCases]);

  useEffect(() => {
    // Only auto-save when we have an authenticated user and a selected case.
    if (!authUid || !selectedCaseId) return;
    if (!notesPages.length || !activePageId) return;

    const payload = JSON.stringify({ notesPages, activePageId });
    if (payload === lastSavedRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaving("saving");
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch('/api/cases', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: selectedCaseId,
            updates: {
              notesPages,
              notesActiveId: activePageId,
              notesUpdatedAt: new Date().toISOString()
            }
          })
        });
        
        lastSavedRef.current = payload;
        setSaving("saved");
      } catch (error) {
        console.error('Failed to save notes', error);
        setSaving("error");
      }
    }, 600);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [authUid, selectedCaseId, notesPages, activePageId]);

  const onChangeTitle = useCallback((val: string) => {
    setSaving("saving");
    setNotesPages(prev => prev.map(p => 
      p.id === activePageId ? { ...p, title: val, updatedAt: new Date().toISOString() } : p
    ));
  }, [activePageId]);

  const onChangeContent = useCallback((val: string) => {
    setSaving("saving");
    setNotesPages(prev => prev.map(p => 
      p.id === activePageId ? { ...p, content: val, updatedAt: new Date().toISOString() } : p
    ));
  }, [activePageId]);

  const appendToActiveNote = useCallback((snippet: string) => {
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
  }, [activePageId]);

  const addPage = () => {
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

  const deletePage = () => {
    if (notesPages.length <= 1) return;
    setPendingDeleteNoteId(activePageId);
    setDeleteModalOpen(true);
  };

  const confirmDeletePage = () => {
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
      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        const errorMessage = typeof data.error === "string" ? data.error : "Failed to summarise note.";
        throw new Error(errorMessage);
      }

      setSummaryResult({
        summary: typeof data.summary === "string" ? data.summary : "",
        actionItems: Array.isArray(data.actionItems)
          ? data.actionItems.filter((item: unknown): item is string => typeof item === "string")
          : [],
        keyRisks: Array.isArray(data.keyRisks)
          ? data.keyRisks.filter((item: unknown): item is string => typeof item === "string")
          : [],
      });
      setSummaryStatus("Summary ready.");
    } catch (error) {
      console.error("Summary failed", error);
      setSummaryStatus(error instanceof Error ? error.message : "Failed to summarise note.");
    } finally {
      setIsSummarising(false);
    }
  }, [activePage]);

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
      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        const errorMessage = typeof data.error === "string" ? data.error : "Failed to extract dates.";
        throw new Error(errorMessage);
      }

      const events = Array.isArray(data.events) ? (data.events as unknown[]) : [];
      const parsedEvents: ExtractedCalendarEvent[] = events
        .map((event: unknown) => {
          const item = event as Record<string, unknown>;
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
  }, [activePage]);

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
          const payload = await response.json().catch(() => ({} as Record<string, unknown>));
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

  const selectedCase = availableCases.find(c => c.id === selectedCaseId);
  const caseLabel = selectedCase?.title
    ? `Saving to: ${selectedCase.title}`
    : hasCase
    ? "No case selected. Notes stay local until you choose a case."
    : "No case profile yet. Notes remain available on this page.";

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
          <button className={styles.newNoteBtn} onClick={addPage}>
            <i className="bx bx-plus" />
            <span>New Note</span>
          </button>
        </div>

        <div className={styles.notesListTitle}>
          <h2>My Notes <span className={styles.notesCount}>{filteredNotes.length}</span></h2>
        </div>

        <div className={styles.notesListContent}>
          {loadingCases ? (
            <div className={styles.emptyState}>
              <i className="bx bx-loader-alt bx-spin" />
              <p>Loading notes...</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="bx bx-note" />
              <h3>No case notes yet</h3>
              <p>Click &quot;New Note&quot; to start documenting your case</p>
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
                    onClick={(e) => {
                      e.stopPropagation();
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
          <a href="/dashboard" className={styles.dashboardLink}>
            <i className="bx bx-arrow-back" />
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
              </div>
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
            </div>

            <div className={styles.editorContent}>
              <input
                type="text"
                className={styles.noteTitle}
                value={activePage.title}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder="Note title"
              />
              
              <textarea
                className={styles.noteBody}
                value={activePage.content}
                onChange={(e) => onChangeContent(e.target.value)}
                placeholder="Start writing your note..."
              />

              {summaryResult && (
                <div className={styles.helperCard}>
                  <div className={styles.helperCardTitle}>
                    <i className="bx bx-align-left" />
                    <span>AI Summary</span>
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
                    <button type="button" className={styles.secondaryButton} onClick={addSummaryToNote}>
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
                      disabled={isSavingExtractedEvents}
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
                {saving === "saving" ? "Saving..." : saving === "error" ? "Save failed" : "All changes saved"}
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
