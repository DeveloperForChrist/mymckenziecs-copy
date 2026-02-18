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

  const onChangeTitle = (val: string) => {
    setSaving("saving");
    setNotesPages(prev => prev.map(p => 
      p.id === activePageId ? { ...p, title: val, updatedAt: new Date().toISOString() } : p
    ));
  };

  const onChangeContent = (val: string) => {
    setSaving("saving");
    setNotesPages(prev => prev.map(p => 
      p.id === activePageId ? { ...p, content: val, updatedAt: new Date().toISOString() } : p
    ));
  };

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
              <h1 className={styles.editorTitle}>MyNotes</h1>
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
            </div>

            <div className={styles.editorFooter}>
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
