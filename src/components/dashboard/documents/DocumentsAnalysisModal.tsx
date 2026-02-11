import React from "react";
import styles from "../documents-page-new.module.css";
import type { Document } from "./types";

type DocumentsAnalysisModalProps = {
  document: Document | null;
  analysisResult: string;
  isAnalysing: boolean;
  formatDate: (value: string) => string;
  onClose: () => void;
};

export default function DocumentsAnalysisModal({
  document,
  analysisResult,
  isAnalysing,
  formatDate,
  onClose,
}: DocumentsAnalysisModalProps) {
  if (!document) return null;

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h3>{document.title}</h3>
            <p>{document.type} • {formatDate(document.createdAt)}</p>
          </div>
          <button onClick={onClose} className={styles.closeBtn} type="button">×</button>
        </div>
        <div className={styles.modalBody}>
          {isAnalysing ? (
            <div className={styles.loading}>
              <i className="bx bx-loader-alt bx-spin"></i>
              <p>Analyzing document...</p>
            </div>
          ) : (
            <div className={styles.analysisResult}>{analysisResult}</div>
          )}
        </div>
      </div>
    </div>
  );
}
