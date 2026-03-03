import styles from "../documents-page-new.module.css";

type DocumentsHeaderProps = {
  title: string;
  totalDocs: number;
  starredDocs: number;
  storageLabel: string;
};

export default function DocumentsHeader({
  title,
  totalDocs,
  starredDocs,
  storageLabel,
}: DocumentsHeaderProps) {
  return (
    <div className={styles.headerSection}>
      <div className={styles.headerTitle}>
        <h1>{title}</h1>
        <p>Organize, upload, and manage your documents</p>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{totalDocs}</span>
          <span className={styles.statLabel}>Files</span>
        </div>
        <div className={styles.statDivider}></div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{starredDocs}</span>
          <span className={styles.statLabel}>Starred</span>
        </div>
        <div className={styles.statDivider}></div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{storageLabel}</span>
          <span className={styles.statLabel}>Storage</span>
        </div>
      </div>
    </div>
  );
}
