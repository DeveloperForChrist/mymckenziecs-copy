import styles from "../documents-page-new.module.css";
import type { Folder } from "./types";

type DocumentsSidebarProps = {
  folders: Folder[];
  activeFolderId: string | null;
  onSelectAll: () => void;
  onSelectFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onCreateFolder: () => void;
  dashboardHref: string;
  embedded?: boolean;
};

export default function DocumentsSidebar({
  folders,
  activeFolderId,
  onSelectAll,
  onSelectFolder,
  onDeleteFolder,
  onCreateFolder,
  dashboardHref,
  embedded = false,
}: DocumentsSidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarContent}>
        <div className={styles.foldersSection}>
          <div className={styles.folderHeader}>
            <span>Folders</span>
            <button
              className={styles.addFolderBtn}
              onClick={onCreateFolder}
              title="New folder"
              type="button"
            >
              <i className="bx bx-plus"></i>
            </button>
          </div>
          <div className={styles.foldersList}>
            <div
              className={`${styles.folderItem} ${!activeFolderId ? styles.folderItemActive : ""}`}
              onClick={onSelectAll}
            >
              <i className="bx bx-folder"></i>
              <span className={styles.folderName}>All files</span>
            </div>
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={`${styles.folderItem} ${activeFolderId === folder.id ? styles.folderItemActive : ""}`}
                onClick={() => onSelectFolder(folder.id)}
              >
                <i className="bx bx-folder"></i>
                <span className={styles.folderName}>{folder.name}</span>
                <button
                  className={styles.folderDelete}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteFolder(folder.id);
                  }}
                  type="button"
                >
                  <i className="bx bx-x"></i>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!embedded && (
        <div className={styles.sidebarFooter}>
          <a href={dashboardHref} className={styles.dashboardLink}>
            Go to Dashboard
          </a>
        </div>
      )}
    </aside>
  );
}
