import styles from "../documents-page-new.module.css";
import type { Folder } from "./types";

type DocumentsSidebarProps = {
  folders: Folder[];
  activeFolderId: string | null;
  activeSection: 'home' | 'myfiles' | 'shared' | 'recycle';
  onSelectAll: () => void;
  onSelectFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onCreateFolder: () => void;
  onSelectSection: (section: 'home' | 'myfiles' | 'shared' | 'recycle') => void;
  canUpload: boolean;
  userName: string;
  onUploadTrigger: () => void;
};

export default function DocumentsSidebar({
  folders,
  activeFolderId,
  activeSection,
  onSelectAll,
  onSelectFolder,
  onDeleteFolder,
  onCreateFolder,
  onSelectSection,
  canUpload,
  userName,
  onUploadTrigger,
}: DocumentsSidebarProps) {

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarContent}>
        {/* Create / Upload button */}
        <div className={styles.sidebarTopActions}>
          <button
            type="button"
            className={styles.createUploadBtn}
            onClick={onUploadTrigger}
            disabled={!canUpload}
          >
            <i className="bx bx-plus-circle" />
            Create or upload
          </button>
        </div>

        {/* User */}
        <div className={styles.sidebarUser}>
          <div className={styles.sidebarUserAvatar}>
            {userName.slice(0, 1).toUpperCase() || 'U'}
          </div>
          <span className={styles.sidebarUserName}>{userName || 'My Storage'}</span>
        </div>

        {/* Primary nav */}
        <nav className={styles.sidebarNav}>
          <button
            type="button"
            className={`${styles.sidebarNavItem} ${activeSection === 'home' && !activeFolderId ? styles.sidebarNavItemActive : ''}`}
            onClick={() => { onSelectAll(); onSelectSection('home'); }}
          >
            <i className="bx bx-home" />
            <span>Home</span>
          </button>
          <button
            type="button"
            className={`${styles.sidebarNavItem} ${activeSection === 'myfiles' && !activeFolderId ? styles.sidebarNavItemActive : ''}`}
            onClick={() => { onSelectAll(); onSelectSection('myfiles'); }}
          >
            <i className="bx bx-file-blank" />
            <span>My Files</span>
          </button>
          <button
            type="button"
            className={`${styles.sidebarNavItem} ${activeSection === 'shared' ? styles.sidebarNavItemActive : ''}`}
            onClick={() => onSelectSection('shared')}
          >
            <i className="bx bx-user-plus" />
            <span>Shared</span>
          </button>
          <button
            type="button"
            className={`${styles.sidebarNavItem} ${activeSection === 'recycle' ? styles.sidebarNavItemActive : ''}`}
            onClick={() => onSelectSection('recycle')}
          >
            <i className="bx bx-trash" />
            <span>Recycle bin</span>
          </button>
        </nav>

        {/* Folders */}
        <div className={styles.foldersSection}>
          <div className={styles.folderHeader}>
            <span>Folders</span>
            <button
              className={styles.addFolderBtn}
              onClick={onCreateFolder}
              title="New folder"
              type="button"
            >
              <i className="bx bx-plus" />
            </button>
          </div>
          <div className={styles.foldersList}>
            {folders.length === 0 ? (
              <div className={styles.folderHint}>No folders yet</div>
            ) : (
              folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`${styles.folderItem} ${activeFolderId === folder.id ? styles.folderItemActive : ''}`}
                  onClick={() => onSelectFolder(folder.id)}
                >
                  <i className="bx bxs-folder" />
                  <span className={styles.folderName}>{folder.name}</span>
                  <button
                    className={styles.folderDelete}
                    onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }}
                    type="button"
                  >
                    <i className="bx bx-x" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Browse by */}
        <div className={styles.browseSectionLabel}>Browse files by</div>
        <nav className={styles.sidebarNav}>
          <button type="button" className={styles.sidebarNavItem}>
            <i className="bx bx-user" />
            <span>People</span>
          </button>
        </nav>
      </div>

    </aside>
  );
}
