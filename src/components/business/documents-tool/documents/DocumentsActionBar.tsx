import React from "react";
import styles from "../documents-page-new.module.css";

type DocumentsActionBarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  uploading: boolean;
  canUpload: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function DocumentsActionBar({
  searchQuery,
  onSearchChange,
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
        <label
          className={`${styles.primaryBtn} ${!canUpload ? styles.primaryBtnDisabled : ""}`}
          aria-disabled={!canUpload}
        >
          {canUpload ? (uploading ? "Uploading…" : "Upload +") : "Upload locked"}
          <input data-testid="documents-upload-input" type="file" multiple hidden onChange={onUpload} disabled={!canUpload || uploading} />
        </label>
      </div>
    </div>
  );
}
