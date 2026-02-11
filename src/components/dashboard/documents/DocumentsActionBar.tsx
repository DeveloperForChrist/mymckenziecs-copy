import React from "react";
import styles from "../documents-page-new.module.css";
import type { Folder } from "./types";

type DocumentsActionBarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onCreateFolder: () => void;
  folders: Folder[];
  uploadFolderId: string;
  onUploadFolderChange: (value: string) => void;
  uploading: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function DocumentsActionBar({
  searchQuery,
  onSearchChange,
  onCreateFolder,
  folders,
  uploadFolderId,
  onUploadFolderChange,
  uploading,
  onUpload,
}: DocumentsActionBarProps) {
  return (
    <div className={styles.actionBar}>
      <div className={styles.searchContainer}>
        <i className="bx bx-search"></i>
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.actionButtons}>
        <button className={styles.secondaryBtn} onClick={onCreateFolder} type="button">
          New folder
        </button>
        {folders.length > 0 && (
          <div className={styles.folderSelectWrap}>
            <label className={styles.folderSelectLabel}>Upload to</label>
            <select
              className={styles.folderSelect}
              value={uploadFolderId}
              onChange={(event) => onUploadFolderChange(event.target.value)}
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className={styles.primaryBtn}>
          {uploading ? "Uploading…" : "Upload +"}
          <input type="file" multiple hidden onChange={onUpload} />
        </label>
      </div>
    </div>
  );
}
