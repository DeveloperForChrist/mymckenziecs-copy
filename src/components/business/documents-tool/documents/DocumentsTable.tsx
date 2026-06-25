import styles from "../documents-page-new.module.css";
import type { Document } from "./types";

type DocumentsTableProps = {
  items: Document[];
  formatDate: (value: string) => string;
  formatSize: (value: number) => string;
  onView: (doc: Document) => void;
  onDownload: (doc: Document) => void;
  onToggleStar: (id: string) => void;
  canDelete: boolean;
  onDelete: (id: string) => void;
};

export default function DocumentsTable({
  items,
  formatDate,
  formatSize,
  onView,
  onDownload,
  onToggleStar,
  canDelete,
  onDelete,
}: DocumentsTableProps) {
  return (
    <div className={styles.fileTable}>
      <div className={styles.tableHeader}>
        <div className={styles.headerCell}>Name</div>
        <div className={styles.headerCell}>Type</div>
        <div className={styles.headerCell}>Date</div>
        <div className={styles.headerCell}>Size</div>
      </div>

      <div className={styles.tableBody}>
        {items.map((doc) => (
          <div key={doc.id} className={styles.tableRow} data-testid="document-row" data-document-title={doc.title}>
            <div className={styles.cell} data-label="Name">
              <div className={styles.fileName}>
                <i className="bx bx-file"></i>
                <span title={doc.title}>{doc.title}</span>
              </div>
              <div className={styles.rowActions}>
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
            <div className={`${styles.cell} ${styles.metaCell}`} data-label="Type">{doc.type}</div>
            <div className={`${styles.cell} ${styles.metaCell}`} data-label="Date">{formatDate(doc.createdAt)}</div>
            <div className={`${styles.cell} ${styles.metaCell}`} data-label="Size">{formatSize(doc.size || 0)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
