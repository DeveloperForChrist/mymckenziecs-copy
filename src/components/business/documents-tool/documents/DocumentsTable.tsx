import styles from "../documents-page-new.module.css";
import type { Document, Folder } from "./types";

type DocumentsTableProps = {
  items: Document[];
  folders: Folder[];
  formatDate: (value: string) => string;
  formatSize: (value: number) => string;
  onView: (doc: Document) => void;
  onDownload: (doc: Document) => void;
  onToggleStar: (id: string) => void;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onFolderChange: (docId: string, folderId: string) => void;
};

export default function DocumentsTable({
  items,
  folders,
  formatDate,
  formatSize,
  onView,
  onDownload,
  onToggleStar,
  canDelete,
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
          <div key={doc.id} className={styles.tableRow} data-testid="document-row" data-document-title={doc.title}>
            <div className={styles.cell} data-label="Name">
              <div className={styles.fileName}>
                <i className="bx bx-file"></i>
                <span title={doc.title}>{doc.title}</span>
              </div>
            </div>
            <div className={`${styles.cell} ${styles.metaCell}`} data-label="Type">{doc.type}</div>
            <div className={`${styles.cell} ${styles.metaCell}`} data-label="Modified">{formatDate(doc.createdAt)}</div>
            <div className={`${styles.cell} ${styles.metaCell}`} data-label="Size">{formatSize(doc.size || 0)}</div>
            <div className={`${styles.cell} ${styles.folderCell}`} data-label="Folder">
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
            <div className={`${styles.cell} ${styles.actionsCell}`} data-label="Actions">
              <div className={styles.actions}>
                <button
                  data-testid="document-view-button"
                  className={styles.actionIcon}
                  onClick={() => onView(doc)}
                  title="View"
                  type="button"
                >
                  <i className="bx bx-show"></i>
                </button>
                <button
                  data-testid="document-download-button"
                  className={styles.actionIcon}
                  onClick={() => onDownload(doc)}
                  title="Download"
                  type="button"
                >
                  <i className="bx bx-download"></i>
                </button>
                <button
                  data-testid="document-star-button"
                  className={`${styles.actionIcon} ${doc.starred ? styles.starActive : ""}`}
                  onClick={() => onToggleStar(doc.id)}
                  title="Star"
                  aria-pressed={doc.starred}
                  type="button"
                >
                  <i className={doc.starred ? "bx bxs-star" : "bx bx-star"}></i>
                </button>
                <button
                  data-testid="document-delete-button"
                  className={`${styles.actionIcon} ${styles.deleteBtn}`}
                  onClick={() => {
                    if (!canDelete) return;
                    onDelete(doc.id);
                  }}
                  title={canDelete ? "Delete" : "Resume plan to delete"}
                  disabled={!canDelete}
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
