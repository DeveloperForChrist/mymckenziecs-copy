"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/database/supabase-browser";
import styles from "./documents-page-new.module.css";
import DocumentsActionBar from "./documents/DocumentsActionBar";
import DocumentsAnalysisModal from "./documents/DocumentsAnalysisModal";
import DocumentsFilters from "./documents/DocumentsFilters";
import DocumentsFolderModal from "./documents/DocumentsFolderModal";
import DocumentsHeader from "./documents/DocumentsHeader";
import DocumentsSidebar from "./documents/DocumentsSidebar";
import DocumentsSummaryModal from "./documents/DocumentsSummaryModal";
import DocumentsTable from "./documents/DocumentsTable";
import DocumentsViewerModal from "./documents/DocumentsViewerModal";
import type { Document, Folder } from "./documents/types";

const mapApiDocument = (x: any, folderMap: Record<string, string>, folderOverride?: string): Document => ({
  id: x.id,
  title: x.name || 'Document',
  content: '',
  type: x.type || (x.mime_type ? x.mime_type.split('/')[1]?.toUpperCase() : 'Document'),
  createdAt: x.created_at || new Date().toISOString(),
  starred: false,
  size: x.file_size || 0,
  folderId: folderOverride || folderMap[x.id] || undefined,
  mimeType: x.mime_type || null,
  storagePath: x.storage_path || null,
  storageUrl: x.storage_url || null
});

export default function DocumentsClient() {
  const [activeFilter, setActiveFilter] = useState<'recents'|'starred'>('recents');
  const [activeFolder, setActiveFolder] = useState<string|null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderMap, setFolderMap] = useState<Record<string, string>>({});
  const [uploadFolderId, setUploadFolderId] = useState<string>('');
  const [activeCaseId, setActiveCaseId] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const [reviewingDocument, setReviewingDocument] = useState<Document | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisById, setAnalysisById] = useState<Record<string, { text: string; highlights?: { start: number; end: number; label?: string; reason?: string }[] }>>({});
  const [summarizingDocument, setSummarizingDocument] = useState<Document | null>(null);
  const [summaryResult, setSummaryResult] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryById, setSummaryById] = useState<Record<string, string>>({});
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUid(data?.user?.id || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    try {
      const storedFolders = localStorage.getItem('documentFolders:v1');
      const storedMap = localStorage.getItem('documentFolderMap:v1');
      if (storedFolders) {
        setFolders(JSON.parse(storedFolders));
      }
      if (storedMap) {
        setFolderMap(JSON.parse(storedMap));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('documentFolders:v1', JSON.stringify(folders));
    } catch (_) {}
  }, [folders]);

  useEffect(() => {
    try {
      localStorage.setItem('documentFolderMap:v1', JSON.stringify(folderMap));
    } catch (_) {}
  }, [folderMap]);

  useEffect(() => {
    if (activeFolder) setUploadFolderId(activeFolder);
  }, [activeFolder]);
  useEffect(() => {
    const controller = new AbortController();
    const fetchDocuments = async () => {
      try {
        const res = await fetch('/api/documents', { credentials: 'include', signal: controller.signal });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load documents');
        }
        setDocuments((data.documents || []).map((x: any) => mapApiDocument(x, folderMap)));
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to fetch documents', err);
      }
    };
    fetchDocuments();
    return () => controller.abort();
  }, [activeCaseId]);

  useEffect(() => {
    if (!documents.length) return;
    setDocuments(prev => {
      let changed = false;
      const next = prev.map(doc => {
        if (!(doc.id in folderMap)) return doc;
        const nextFolderId = folderMap[doc.id] || undefined;
        if (doc.folderId === nextFolderId) return doc;
        changed = true;
        return { ...doc, folderId: nextFolderId };
      });
      return changed ? next : prev;
    });
  }, [folderMap, documents.length]);

  useEffect(() => {
    const param = searchParams?.get?.('folder');
    if (param) setActiveFolder(param);
  }, [searchParams]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setUploadError(null);
    setUploading(true);
    try {
      const files = Array.from(e.target.files);
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      if (activeCaseId) formData.append('caseId', activeCaseId);

      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed');
      }
      const targetFolderId = activeFolder || uploadFolderId || undefined;
      const newDocs = (data.documents || []).map((x:any)=> mapApiDocument(x, folderMap, targetFolderId));
      setDocuments(p=>[...newDocs,...p]);
      const mapFolderId = targetFolderId || '';
      if (mapFolderId) {
        setFolderMap(prev => {
          const next = { ...prev };
          newDocs.forEach(doc => { next[doc.id] = mapFolderId; });
          return next;
        });
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFolderAssignment = (docId: string, folderId: string) => {
    setDocuments(p => p.map(d => d.id == docId ? { ...d, folderId: folderId || undefined } : d));
    setFolderMap(p => ({ ...p, [docId]: folderId }));
  };

  const toggleStar = (id: string) => {
    setDocuments(p => p.map(d => d.id === id ? {...d, starred: !d.starred} : d));
  };

  const deleteDocument = (id: string) => {
    if (confirm('Are you sure you want to delete this document?')) {
      setDocuments(p => p.filter(d => d.id !== id));
    }
  };

  const deleteFolder = (folderId: string) => {
    if (confirm('Are you sure you want to delete this folder?')) {
      setFolders(p => p.filter(f => f.id !== folderId));
      if (activeFolder === folderId) {
        setActiveFolder(null);
        try { router.replace('/dashboard/documents'); } catch(e){}
      }
    }
  };

  const createFolder = () => {
    setShowFolderModal(true);
    setNewFolderName('');
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      setFolders(p => [...p, { id: `folder-${Date.now()}`, name: newFolderName.trim() }]);
      setShowFolderModal(false);
      setNewFolderName('');
    }
  };

  const analyseDocument = async (document: Document, openModal = false) => {
    if (openModal) setReviewingDocument(document);
    setAnalysisResult('');
    setIsAnalysing(true);
    
    try {
      const res = await fetch('/api/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id })
      });
      const data = await res.json();
      if (res.ok && (data.analysis || data.analysisText)) {
        const analysisText = data.analysisText || data.analysis || '';
        setAnalysisResult(analysisText);
        setAnalysisById(prev => ({ ...prev, [document.id]: { text: analysisText, highlights: data.highlights || [] } }));
      } else {
        setAnalysisResult(data.error || 'Failed to analyse document');
      }
    } catch (err) {
      setAnalysisResult('Error analysing document. Please try again.');
    } finally {
      setIsAnalysing(false);
    }
  };

  const summarizeDocument = async (document: Document) => {
    setSummarizingDocument(document);
    setSummaryResult('');
    setIsSummarizing(true);
    
    try {
      if (!document.content) {
        setSummaryResult('Summary is only available for text previews. Download the file for full review.');
        return;
      }
      const res = await fetch('/api/summarize-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: document.title, content: document.content })
      });
      const data = await res.json();
      if (res.ok && data.summary) {
        setSummaryResult(data.summary);
        setSummaryById(prev => ({ ...prev, [document.id]: data.summary }));
      } else {
        setSummaryResult(data.error || 'Failed to summarize document');
      }
    } catch (err) {
      setSummaryResult('Error summarizing document. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const getPreviewKind = (doc: Document) => {
    const name = doc.title.toLowerCase();
    const mime = doc.mimeType || '';
    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'image';
    if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
    if (mime.includes('word') || name.endsWith('.docx')) return 'docx';
    if (mime.startsWith('text/') || /\.(txt|md|csv|json|log)$/.test(name)) return 'text';
    return 'file';
  };

  useEffect(() => {
    const loadPreview = async () => {
      if (!viewingDocument) return;
      setPreviewUrl(null);
      setPreviewText(null);
      setPreviewHtml(null);
      setPreviewError(null);

      if (viewingDocument.content) {
        setPreviewText(viewingDocument.content);
        return;
      }

      if (!viewingDocument.storagePath) {
        setPreviewError('No preview available.');
        return;
      }

      setPreviewLoading(true);
      try {
        const res = await fetch(`/api/documents/${viewingDocument.id}/signed`);
        const data = await res.json();
        if (!res.ok || !data?.url) {
          throw new Error(data?.error || 'Unable to load preview');
        }
        setPreviewUrl(data.url);
        const kind = getPreviewKind(viewingDocument);
        if (kind === 'text' || kind === 'docx') {
          const previewRes = await fetch(`/api/documents/${viewingDocument.id}/preview`);
          const previewData = await previewRes.json();
          if (kind === 'text' && previewData?.text) {
            setPreviewText(previewData.text);
            setDocuments(prev => prev.map(doc => doc.id === viewingDocument.id ? { ...doc, content: previewData.text } : doc));
          }
          if (kind === 'docx' && previewData?.html) {
            setPreviewHtml(previewData.html);
          }
        }
      } catch (err: any) {
        setPreviewError(err?.message || 'Unable to load preview');
      } finally {
        setPreviewLoading(false);
      }
    };
    loadPreview();
  }, [viewingDocument]);

  const fmt = (d:string) => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'});
  const fmtSize = (b:number) => b>1048576?`${(b/1048576).toFixed(1)} MB`:b>0?`${(b/1024).toFixed(0)} KB`:'-';

  const extractIssues = (analysis: string) => {
    if (!analysis) return [];
    const match = analysis.match(/AREAS FOR ATTENTION:\s*([\s\S]*?)(?:\n[A-Z][A-Z\s\-]*:|$)/i);
    if (!match || !match[1]) return [];
    return match[1]
      .split(/\n+/)
      .map(line => line.replace(/^[-•\d\.\)\s]+/, '').trim())
      .filter(line => line.length > 0);
  };

  const buildHighlightedHtml = (html: string, issues: string[]) => {
    if (!html || !issues.length || typeof window === 'undefined') return html;
    const stopwords = new Set(['with', 'this', 'that', 'from', 'into', 'your', 'have', 'need', 'must', 'should', 'could', 'would', 'might', 'there', 'their', 'they', 'them', 'then', 'than']);
    const keywords = new Set<string>();
    issues.forEach(issue => {
      issue.toLowerCase().split(/[^a-z0-9]+/g).forEach(word => {
        if (word.length > 4 && !stopwords.has(word)) keywords.add(word);
      });
    });
    if (!keywords.size) return html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const terms = Array.from(keywords).sort((a, b) => b.length - a.length);

    const wrapMatches = (textNode: Text) => {
      const text = textNode.nodeValue || '';
      let changed = false;
      const fragments: (string | HTMLElement)[] = [];
      let cursor = 0;

      while (cursor < text.length) {
        let foundIndex = -1;
        let foundTerm = '';
        for (const term of terms) {
          const idx = text.toLowerCase().indexOf(term, cursor);
          if (idx !== -1 && (foundIndex === -1 || idx < foundIndex)) {
            foundIndex = idx;
            foundTerm = term;
          }
        }
        if (foundIndex === -1) {
          fragments.push(text.slice(cursor));
          break;
        }
        if (foundIndex > cursor) {
          fragments.push(text.slice(cursor, foundIndex));
        }
        const span = doc.createElement('span');
        span.className = styles.issueHighlight;
        span.textContent = text.slice(foundIndex, foundIndex + foundTerm.length);
        fragments.push(span);
        cursor = foundIndex + foundTerm.length;
        changed = true;
      }

      if (!changed) return;
      const parent = textNode.parentNode;
      if (!parent) return;
      fragments.forEach(fragment => {
        if (typeof fragment === 'string') parent.insertBefore(doc.createTextNode(fragment), textNode);
        else parent.insertBefore(fragment, textNode);
      });
      parent.removeChild(textNode);
    };

    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        textNodes.push(current as Text);
      }
      current = walker.nextNode();
    }
    textNodes.forEach(node => wrapMatches(node));
    return doc.body.innerHTML;
  };

  const buildHighlights = (content: string, issues: string[]) => {
    if (!content) return [{ text: 'No preview available.', highlight: false }];
    if (!issues.length) return [{ text: content, highlight: false }];
    const stopwords = new Set(['with', 'this', 'that', 'from', 'into', 'your', 'have', 'need', 'must', 'should', 'could', 'would', 'might', 'there', 'their', 'they', 'them', 'then', 'than']);
    const keywords = new Set<string>();
    issues.forEach(issue => {
      issue.toLowerCase().split(/[^a-z0-9]+/g).forEach(word => {
        if (word.length > 4 && !stopwords.has(word)) keywords.add(word);
      });
    });
    const sentenceMatches = content.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [content];
    return sentenceMatches.map(sentence => {
      const lower = sentence.toLowerCase();
      const highlight = Array.from(keywords).some(word => lower.includes(word));
      return { text: sentence, highlight };
    });
  };

  const buildHighlightsFromRanges = (content: string, ranges: { start: number; end: number }[]) => {
    if (!content) return [{ text: 'No preview available.', highlight: false }];
    if (!ranges || ranges.length === 0) return [{ text: content, highlight: false }];
    const normalized = ranges
      .filter(r => Number.isFinite(r.start) && Number.isFinite(r.end))
      .map(r => ({
        start: Math.max(0, Math.min(r.start, content.length)),
        end: Math.max(0, Math.min(r.end, content.length))
      }))
      .filter(r => r.end > r.start)
      .sort((a, b) => a.start - b.start);
    const parts: { text: string; highlight: boolean }[] = [];
    let cursor = 0;
    normalized.forEach(range => {
      if (range.start > cursor) {
        parts.push({ text: content.slice(cursor, range.start), highlight: false });
      }
      parts.push({ text: content.slice(range.start, range.end), highlight: true });
      cursor = range.end;
    });
    if (cursor < content.length) {
      parts.push({ text: content.slice(cursor), highlight: false });
    }
    return parts;
  };

  const items = useMemo(() => {
    let arr = [...documents];
    if (activeFilter === 'starred') arr = arr.filter(d => d.starred);
    if (activeFolder) arr = arr.filter(d => d.folderId === activeFolder);
    if (searchQuery) arr = arr.filter(i => i.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [documents, activeFilter, activeFolder, searchQuery]);

  const totalDocs = documents.length;
  const starredDocs = documents.filter(d => d.starred).length;
  const totalBytes = documents.reduce((acc, doc) => acc + (doc.size || 0), 0);
  const activeFolderName = activeFolder ? folders.find(f => f.id === activeFolder)?.name : 'All files';
  const storageLabel = fmtSize(totalBytes);

  const handleSelectAllFolders = () => {
    setActiveFolder(null);
    try { router.replace('/dashboard/documents'); } catch (_) {}
  };

  const handleSelectFolder = (folderId: string) => {
    setActiveFolder(folderId);
    try { router.replace(`/dashboard/documents?folder=${encodeURIComponent(folderId)}`); } catch (_) {}
  };

  const handleViewDocument = (doc: Document) => {
    setViewingDocument(doc);
  };

  const handleAnalyzeFromTable = (doc: Document) => {
    setViewingDocument(doc);
    analyseDocument(doc);
  };

  return (
    <div className={styles.container}>
      <DocumentsSidebar
        folders={folders}
        activeFolderId={activeFolder}
        onSelectAll={handleSelectAllFolders}
        onSelectFolder={handleSelectFolder}
        onDeleteFolder={deleteFolder}
        onCreateFolder={createFolder}
      />

      {/* Main Content */}
      <main className={styles.mainContent}>
        <DocumentsHeader
          title={activeFolderName || 'All files'}
          totalDocs={totalDocs}
          starredDocs={starredDocs}
          storageLabel={storageLabel}
        />

        <DocumentsActionBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onCreateFolder={createFolder}
          folders={folders}
          uploadFolderId={uploadFolderId}
          onUploadFolderChange={setUploadFolderId}
          uploading={uploading}
          onUpload={handleUpload}
        />
        {uploadError && (
          <p style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '-8px' }}>{uploadError}</p>
        )}

        <DocumentsFilters activeFilter={activeFilter} onFilterChange={setActiveFilter} />

        {/* File List */}
        <div className={styles.fileListContainer}>
          {items.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="bx bx-folder-open"></i>
              <h3>{activeFilter === 'starred' ? 'No starred files' : activeFolder ? 'No files in this folder' : 'No files yet'}</h3>
              <p>Upload documents to get started</p>
            </div>
          ) : (
            <DocumentsTable
              items={items}
              folders={folders}
              formatDate={fmt}
              formatSize={fmtSize}
              onView={handleViewDocument}
              onSummarize={summarizeDocument}
              onAnalyze={handleAnalyzeFromTable}
              onToggleStar={toggleStar}
              onDelete={deleteDocument}
              onFolderChange={handleFolderAssignment}
            />
          )}
        </div>
      </main>

      <DocumentsAnalysisModal
        document={reviewingDocument}
        analysisResult={analysisResult}
        isAnalysing={isAnalysing}
        formatDate={fmt}
        onClose={() => setReviewingDocument(null)}
      />

      <DocumentsSummaryModal
        document={summarizingDocument}
        summaryResult={summaryResult}
        isSummarizing={isSummarizing}
        formatDate={fmt}
        onClose={() => setSummarizingDocument(null)}
      />

      <DocumentsViewerModal
        document={viewingDocument}
        formatDate={fmt}
        previewLoading={previewLoading}
        previewError={previewError}
        previewText={previewText}
        previewHtml={previewHtml}
        previewUrl={previewUrl}
        analysisById={analysisById}
        summaryById={summaryById}
        buildHighlights={buildHighlights}
        buildHighlightsFromRanges={buildHighlightsFromRanges}
        buildHighlightedHtml={buildHighlightedHtml}
        extractIssues={extractIssues}
        getPreviewKind={getPreviewKind}
        onAnalyze={analyseDocument}
        onSummarize={summarizeDocument}
        onClose={() => setViewingDocument(null)}
      />

      <DocumentsFolderModal
        open={showFolderModal}
        folderName={newFolderName}
        onFolderNameChange={setNewFolderName}
        onClose={() => setShowFolderModal(false)}
        onCreate={handleCreateFolder}
      />
    </div>
  );
}
