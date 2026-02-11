import React from "react";
import styles from "../documents-page-new.module.css";
import type { Document } from "./types";

type DocumentsSummaryModalProps = {
  document: Document | null;
  summaryResult: string;
  isSummarizing: boolean;
  formatDate: (value: string) => string;
  onClose: () => void;
};

export default function DocumentsSummaryModal({
  document,
  summaryResult,
  isSummarizing,
  formatDate,
  onClose,
}: DocumentsSummaryModalProps) {
  if (!document) return null;

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3>Summary: {document.title}</h3>
            <p>{document.type} • {formatDate(document.createdAt)}</p>
          </div>
          <button onClick={onClose} className={styles.closeBtn} type="button">×</button>
        </div>
        <div className={styles.modalBody}>
          {isSummarizing ? (
            <div className={styles.loading}>
              <i className="bx bx-loader-alt bx-spin"></i>
              <p>Summarizing document...</p>
            </div>
          ) : (
            <div className={styles.analysisResult}>{summaryResult}</div>
          )}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.secondaryBtn} onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}
