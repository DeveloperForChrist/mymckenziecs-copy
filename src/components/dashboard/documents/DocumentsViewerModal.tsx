import React from "react";
import styles from "../documents-page-new.module.css";
import type { Document } from "./types";

type HighlightRange = { start: number; end: number; label?: string; reason?: string };

type HighlightPart = { text: string; highlight: boolean };

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
  buildHighlightsFromRanges,
  buildHighlightedHtml,
  extractIssues,
  getPreviewKind,
  onClose,
}: DocumentsViewerModalProps) {
  if (!document) return null;

  const issues: string[] = [];
  const previewKind = getPreviewKind(document);

  let highlightedParts: HighlightPart[] = [];
  if (previewText) {
    highlightedParts = buildHighlights(previewText, issues);
  }

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.viewerModal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3>{document.title}</h3>
            <p>{document.type} • {formatDate(document.createdAt)}</p>
          </div>
          <button onClick={onClose} className={styles.closeBtn} type="button">×</button>
        </div>
        <div className={styles.viewerBody}>
          <div className={styles.viewerPane}>
            <div className={styles.viewerPaneTitle}>Document Preview</div>
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
              <iframe className={styles.viewerFrame} src={previewUrl} title={document.title} />
            ) : (
              <div className={styles.viewerText}>No inline preview available.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
