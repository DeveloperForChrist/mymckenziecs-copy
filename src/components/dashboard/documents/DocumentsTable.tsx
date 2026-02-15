import React from "react";
import styles from "../documents-page-new.module.css";
import type { Document, Folder } from "./types";

type DocumentsTableProps = {
  items: Document[];
  folders: Folder[];
  formatDate: (value: string) => string;
  formatSize: (value: number) => string;
  onView: (doc: Document) => void;
  onToggleStar: (id: string) => void;
  onDelete: (id: string) => void;
  onFolderChange: (docId: string, folderId: string) => void;
};

export default function DocumentsTable({
  items,
  folders,
  formatDate,
  formatSize,
  onView,
  onToggleStar,
  onDelete,
  onFolderChange,
}: DocumentsTableProps) {
  return (
    <div className={styles.fileTable}>
      <div className={styles.tableHeader}>
        <div className={styles.headerCell}>Name</div>
        <div className={styles.headerCell}>Type</div>
        <div className={styles.headerCell}>Modified</div>
        <div className={styles.headerCell}>Size</div>
        <div className={styles.headerCell}>Folder</div>
        <div className={styles.headerCell}>Actions</div>
      </div>

      <div className={styles.tableBody}>
        {items.map((doc) => (
          <div key={doc.id} className={styles.tableRow}>
            <div className={styles.cell}>
              <div className={styles.fileName}>
                <i className="bx bx-file"></i>
                <span title={doc.title}>{doc.title}</span>
              </div>
            </div>
            <div className={styles.cell}>{doc.type}</div>
            <div className={styles.cell}>{formatDate(doc.createdAt)}</div>
            <div className={styles.cell}>{formatSize(doc.size || 0)}</div>
            <div className={styles.cell}>
              <select
                className={styles.folderInlineSelect}
                value={doc.folderId || ""}
                onChange={(event) => onFolderChange(doc.id, event.target.value)}
              >
                <option value="">No folder</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.cell}>
              <div className={styles.actions}>
                <button
                  className={styles.actionIcon}
                  onClick={() => onView(doc)}
                  title="View"
                  type="button"
                >
                  <i className="bx bx-show"></i>
                </button>
                <button
                  className={`${styles.actionIcon} ${doc.starred ? styles.starActive : ""}`}
                  onClick={() => onToggleStar(doc.id)}
                  title="Star"
                  type="button"
                >
                  <i className={doc.starred ? "bx bxs-star" : "bx bx-star"}></i>
                </button>
                <button
                  className={`${styles.actionIcon} ${styles.deleteBtn}`}
                  onClick={() => onDelete(doc.id)}
                  title="Delete"
                  type="button"
                >
                  <i className="bx bx-trash"></i>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
