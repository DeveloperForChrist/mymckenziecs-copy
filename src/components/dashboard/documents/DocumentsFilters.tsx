import React from "react";
import styles from "../documents-page-new.module.css";

type DocumentsFiltersProps = {
  activeFilter: "recents" | "starred";
  onFilterChange: (filter: "recents" | "starred") => void;
};

export default function DocumentsFilters({
  activeFilter,
  onFilterChange,
}: DocumentsFiltersProps) {
  return (
    <div className={styles.filterTabs}>
      <button
        className={`${styles.tab} ${activeFilter === "recents" ? styles.tabActive : ""}`}
        onClick={() => onFilterChange("recents")}
        type="button"
      >
        Recents
      </button>
      <button
        className={`${styles.tab} ${activeFilter === "starred" ? styles.tabActive : ""}`}
        onClick={() => onFilterChange("starred")}
        type="button"
      >
        Starred
      </button>
    </div>
  );
}
