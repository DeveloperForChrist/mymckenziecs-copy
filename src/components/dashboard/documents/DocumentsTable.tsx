import { useState } from "react";
import styles from "../documents-page-new.module.css";
import type { Document, Folder } from "./types";

function getFileIconInfo(doc: Document): { bg: string; color: string; label: string } {
  const name = (doc.title || '').toLowerCase();
  const mime = (doc.mimeType || '').toLowerCase();
  if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx'))
    return { bg: '#185abd22', color: '#185abd', label: 'W' };
  if (mime.includes('excel') || mime.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv'))
    return { bg: '#107c4122', color: '#107c41', label: 'X' };
  if (mime.includes('powerpoint') || mime.includes('presentation') || name.endsWith('.pptx') || name.endsWith('.ppt'))
    return { bg: '#c43e1c22', color: '#c43e1c', label: 'P' };
  if (mime.includes('pdf') || name.endsWith('.pdf'))
    return { bg: '#d52b1e22', color: '#d52b1e', label: 'PDF' };
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name))
    return { bg: '#5b47e022', color: '#7c5df9', label: '⬛' };
  return { bg: '#0078d422', color: '#0078d4', label: '📄' };
}

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
  userName?: string;
};

export default function DocumentsTable({
  items,
  folders,
  formatDate,
  onView,
  onDownload,
  onToggleStar,
  canDelete,
  onDelete,
  onFolderChange,
  userName = 'You',
}: DocumentsTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const getFolderLabel = (folderId?: string) => {
    if (!folderId) return 'My Files';
    return folders.find((f) => f.id === folderId)?.name ?? 'My Files';
  };

  return (
    <div className={styles.fileTable}>
      <div className={styles.tableHeader}>
        <div className={styles.headerCell}>Name</div>
        <div className={styles.headerCell}>Opened</div>
        <div className={styles.headerCell}>Owner</div>
        <div className={styles.headerCell} />
      </div>

      <div className={styles.tableBody}>
        {items.map((doc) => {
          const icon = getFileIconInfo(doc);
          const isHovered = hoveredId === doc.id;
          const isMenuOpen = menuOpenId === doc.id;

          return (
            <div
              key={doc.id}
              className={`${styles.tableRow} ${isHovered ? styles.tableRowHovered : ''}`}
              onMouseEnter={() => setHoveredId(doc.id)}
              onMouseLeave={() => { setHoveredId(null); if (!isMenuOpen) setMenuOpenId(null); }}
            >
              {/* Name + location */}
              <div className={styles.cell}>
                <div className={styles.fileName}>
                  <div className={styles.fileIconBox} style={{ background: icon.bg, color: icon.color }}>
                    <span>{icon.label}</span>
                  </div>
                  <div className={styles.fileNameStack}>
                    <button type="button" className={styles.fileNameLink} onClick={() => onView(doc)}>
                      {doc.title}
                    </button>
                    <span className={styles.fileLocation}>{getFolderLabel(doc.folderId)}</span>
                  </div>
                </div>
              </div>

              {/* Opened */}
              <div className={styles.cell} data-label="Opened">
                {formatDate(doc.createdAt)}
              </div>

              {/* Owner */}
              <div className={styles.cell} data-label="Owner">
                {userName}
              </div>

              {/* Hover actions */}
              <div className={styles.cell}>
                <div className={styles.rowActions} style={{ opacity: isHovered || isMenuOpen ? 1 : 0 }}>
                  <button
                    type="button"
                    className={`${styles.actionIcon} ${doc.starred ? styles.starActive : ''}`}
                    onClick={() => onToggleStar(doc.id)}
                    title="Star"
                  >
                    <i className={doc.starred ? 'bx bxs-star' : 'bx bx-star'} />
                  </button>
                  <button
                    type="button"
                    className={styles.actionIcon}
                    onClick={() => onDownload(doc)}
                    title="Download"
                  >
                    <i className="bx bx-download" />
                  </button>

                  {/* ··· menu */}
                  <div className={styles.menuWrap}>
                    <button
                      type="button"
                      className={styles.actionIcon}
                      onClick={() => setMenuOpenId(isMenuOpen ? null : doc.id)}
                      title="More options"
                    >
                      <i className="bx bx-dots-horizontal-rounded" />
                    </button>
                    {isMenuOpen && (
                      <div className={styles.dropMenu}>
                        <button type="button" onClick={() => { onView(doc); setMenuOpenId(null); }}>
                          <i className="bx bx-show" /> Open
                        </button>
                        <button type="button" onClick={() => { onDownload(doc); setMenuOpenId(null); }}>
                          <i className="bx bx-download" /> Download
                        </button>
                        <div className={styles.menuDivider} />
                        <div className={styles.menuMoveRow}>
                          <span>Move to folder</span>
                          <select
                            className={styles.folderInlineSelect}
                            value={doc.folderId || ''}
                            onChange={(e) => { onFolderChange(doc.id, e.target.value); setMenuOpenId(null); }}
                          >
                            <option value="">My Files</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                        {canDelete && (
                          <>
                            <div className={styles.menuDivider} />
                            <button
                              type="button"
                              className={styles.menuDeleteBtn}
                              onClick={() => { onDelete(doc.id); setMenuOpenId(null); }}
                            >
                              <i className="bx bx-trash" /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
