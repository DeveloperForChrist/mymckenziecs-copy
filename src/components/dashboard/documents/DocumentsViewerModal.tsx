import React from "react";
import styles from "../documents-page-new.module.css";
import type { Document } from "./types";

type HighlightRange = { start: number; end: number; label?: string; reason?: string };

type AnalysisEntry = {
  text: string;
  highlights?: HighlightRange[];
};

type HighlightPart = { text: string; highlight: boolean };

type DocumentsViewerModalProps = {
  document: Document | null;
  formatDate: (value: string) => string;
  previewLoading: boolean;
  previewError: string | null;
  previewText: string | null;
  previewHtml: string | null;
  previewUrl: string | null;
  analysisById: Record<string, AnalysisEntry>;
  summaryById: Record<string, string>;
  buildHighlights: (content: string, issues: string[]) => HighlightPart[];
  buildHighlightsFromRanges: (content: string, ranges: HighlightRange[]) => HighlightPart[];
  buildHighlightedHtml: (html: string, issues: string[]) => string;
  extractIssues: (analysis: string) => string[];
  getPreviewKind: (doc: Document) => string;
  onAnalyze: (doc: Document) => void;
  onSummarize: (doc: Document) => void;
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
  analysisById,
  summaryById,
  buildHighlights,
  buildHighlightsFromRanges,
  buildHighlightedHtml,
  extractIssues,
  getPreviewKind,
  onAnalyze,
  onSummarize,
  onClose,
}: DocumentsViewerModalProps) {
  if (!document) return null;

  const analysis = analysisById[document.id];
  const issues = extractIssues(analysis?.text || "");
  const previewKind = getPreviewKind(document);

  let highlightedParts: HighlightPart[] = [];
  if (previewText) {
    highlightedParts = analysis?.highlights?.length
      ? buildHighlightsFromRanges(previewText, analysis.highlights || [])
      : buildHighlights(previewText, issues);
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
              <div className={styles.viewerText}>
                No inline preview available. {previewUrl ? "Use the download button." : ""}
              </div>
            )}
            {previewUrl && (
              <a className={styles.secondaryBtn} href={previewUrl} target="_blank" rel="noreferrer">
                Download file
              </a>
            )}
          </div>

          <div className={styles.viewerSide}>
            <div className={styles.viewerPaneTitle}>Review Highlights</div>
            {analysis?.text ? (
              <div className={styles.sideCard}>
                <p className={styles.sideCardTitle}>Issues to check</p>
                <div className={styles.issueList}>
                  {extractIssues(analysis.text).slice(0, 6).map((issue, idx) => (
                    <div key={`${document.id}-issue-${idx}`} className={styles.issueItem}>
                      {issue}
                    </div>
                  ))}
                  {extractIssues(analysis.text).length === 0 && (
                    <div className={styles.issueItem}>No issues flagged yet. Run Review for deeper checks.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.sideCard}>
                <p className={styles.sideCardTitle}>Run a review</p>
                <p className={styles.sideCardText}>Check grammar, clarity, missing info, and key facts.</p>
                <button className={styles.secondaryBtn} onClick={() => onAnalyze(document)} type="button">
                  Review document
                </button>
              </div>
            )}

            {!summaryById[document.id] && (
              <div className={styles.sideCard}>
                <p className={styles.sideCardTitle}>Quick summary</p>
                <p className={styles.sideCardText}>Generate a concise summary and key facts.</p>
                <button className={styles.secondaryBtn} onClick={() => onSummarize(document)} type="button">
                  Generate summary
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
