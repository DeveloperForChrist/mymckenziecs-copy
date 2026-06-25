import React from "react";
import styles from "../documents-page-new.module.css";
import type { Folder } from "./types";

type DocumentsActionBarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  folders: Folder[];
  uploadFolderId: string;
  onUploadFolderChange: (value: string) => void;
  uploading: boolean;
  canUpload: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function DocumentsActionBar({
  searchQuery,
  onSearchChange,
  folders,
  uploadFolderId,
  onUploadFolderChange,
  uploading,
  canUpload,
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
        <div className={styles.uploadGroup}>
          <label className={styles.uploadGroupLabel}>Upload to</label>
          <div className={styles.uploadGroupControls}>
            <select
              className={styles.folderSelect}
              value={uploadFolderId}
              disabled={!canUpload || uploading}
              onChange={(event) => onUploadFolderChange(event.target.value)}
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <label
              className={`${styles.primaryBtn} ${!canUpload ? styles.primaryBtnDisabled : ""}`}
              aria-disabled={!canUpload}
            >
              {canUpload ? (uploading ? "Uploading…" : "Upload +") : "Upload locked"}
              <input data-testid="documents-upload-input" type="file" multiple hidden onChange={onUpload} disabled={!canUpload || uploading} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
