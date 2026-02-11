import React from "react";
import styles from "../documents-page-new.module.css";

type DocumentsFolderModalProps = {
  open: boolean;
  folderName: string;
  onFolderNameChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
};

export default function DocumentsFolderModal({
  open,
  folderName,
  onFolderNameChange,
  onClose,
  onCreate,
}: DocumentsFolderModalProps) {
  if (!open) return null;

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.dialogContent} onClick={(event) => event.stopPropagation()}>
        <h3>Create New Folder</h3>
        <input
          type="text"
          value={folderName}
          onChange={(event) => onFolderNameChange(event.target.value)}
          placeholder="Folder name"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") onCreate();
            if (event.key === "Escape") onClose();
          }}
          className={styles.dialogInput}
        />
        <div className={styles.dialogButtons}>
          <button className={styles.secondaryBtn} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className={styles.primaryBtn}
            onClick={onCreate}
            disabled={!folderName.trim()}
            type="button"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
