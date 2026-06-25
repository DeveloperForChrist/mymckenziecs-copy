import { useEffect, useState } from "react";
import styles from "../documents-page-new.module.css";
import type { Document } from "./types";

type HighlightPart = { text: string; highlight: boolean };
type HighlightRange = { start: number; end: number; label?: string; reason?: string };

type DocumentsViewerModalProps = {
  document: Document | null;
  formatDate: (value: string) => string;
  previewLoading: boolean;
  previewError: string | null;
  previewText: string | null;
  previewHtml: string | null;
  previewUrl: string | null;
  buildHighlights: (content: string, issues: string[]) => HighlightPart[];
  buildHighlightsFromRanges: (content: string, ranges: HighlightRange[]) => HighlightPart[];
  buildHighlightedHtml: (html: string, issues: string[]) => string;
  extractIssues: (analysis: string) => string[];
  getPreviewKind: (doc: Document) => string;
  onClose: () => void;
};

export default function DocumentsViewerModal({
  document,
  formatDate,
  previewLoading,
  previewError,
  previewText,
  previewHtml,
  previewUrl,
  buildHighlights,
  buildHighlightsFromRanges: _buildHighlightsFromRanges,
  buildHighlightedHtml,
  extractIssues: _extractIssues,
  getPreviewKind,
  onClose,
}: DocumentsViewerModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfPage, setPdfPage] = useState(1);

  useEffect(() => {
    setPdfPage(1);
  }, [document?.id]);

  if (!document) return null;

  const issues: string[] = [];
  const previewKind = getPreviewKind(document);

  let highlightedParts: HighlightPart[] = [];
  if (previewText) {
    highlightedParts = buildHighlights(previewText, issues);
  }
  const canPagePreview = previewKind === "pdf" && Boolean(previewUrl);
  const pdfPreviewUrl = canPagePreview && previewUrl
    ? `${previewUrl.split("#")[0]}#page=${pdfPage}`
    : previewUrl;

  return (
    <div className={styles.modal} onClick={onClose}>
      <div
        className={`${styles.viewerModal} ${isFullscreen ? styles.viewerModalFullscreen : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h3>{document.title}</h3>
            <p>{document.type} • {formatDate(document.createdAt)}</p>
          </div>
          <div className={styles.modalHeaderActions}>
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className={styles.closeBtn}
              type="button"
              aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
              title={isFullscreen ? "Exit full screen" : "Full screen"}
            >
              <i className={`bx ${isFullscreen ? "bx-exit-fullscreen" : "bx-fullscreen"}`} />
            </button>
            <button onClick={onClose} className={styles.closeBtn} type="button" aria-label="Close preview">×</button>
          </div>
        </div>
        <div className={styles.viewerBody}>
          <button
            className={styles.pageArrow}
            type="button"
            aria-label="Previous page"
            title={canPagePreview ? "Previous page" : "Page navigation is available for PDFs"}
            disabled={!canPagePreview || pdfPage <= 1}
            onClick={() => setPdfPage((page) => Math.max(1, page - 1))}
          >
            <i className="bx bx-chevron-left" />
          </button>
          <div className={styles.viewerPane}>
            <div className={styles.viewerPaneTitle}>
              <span>Document Preview</span>
              {canPagePreview && <span>Page {pdfPage}</span>}
            </div>
            {previewLoading ? (
              <div className={styles.loading}>
                <i className="bx bx-loader-alt bx-spin"></i>
                <p>Loading preview…</p>
              </div>
            ) : previewError ? (
              <div className={styles.viewerText}>{previewError}</div>
            ) : previewText ? (
              <div className={styles.viewerText}>
                {highlightedParts.map((part, index) => (
                  <span
                    key={`${document.id}-part-${index}`}
                    className={part.highlight ? styles.issueHighlight : undefined}
                  >
                    {part.text}
                  </span>
                ))}
              </div>
            ) : previewHtml ? (
              <div
                className={styles.viewerHtml}
                dangerouslySetInnerHTML={{
                  __html: buildHighlightedHtml(previewHtml, issues),
                }}
              />
            ) : previewKind === "image" && previewUrl ? (
              <div className={styles.viewerMedia}>
                <img src={previewUrl} alt={document.title} />
              </div>
            ) : previewKind === "pdf" && previewUrl ? (
              <iframe className={styles.viewerFrame} src={pdfPreviewUrl || previewUrl} title={document.title} />
            ) : (
              <div className={styles.viewerText}>No inline preview available.</div>
            )}
          </div>
          <button
            className={styles.pageArrow}
            type="button"
            aria-label="Next page"
            title={canPagePreview ? "Next page" : "Page navigation is available for PDFs"}
            disabled={!canPagePreview}
            onClick={() => setPdfPage((page) => page + 1)}
          >
            <i className="bx bx-chevron-right" />
          </button>
        </div>
      </div>
    </div>
  );
}
