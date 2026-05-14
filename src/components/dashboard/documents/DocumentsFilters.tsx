import styles from "../documents-page-new.module.css";

export type FileTypeFilter = 'all' | 'word' | 'excel' | 'powerpoint' | 'pdf' | 'image';

const FILE_TABS: { id: FileTypeFilter; label: string }[] = [
  { id: 'all',         label: 'All' },
  { id: 'word',        label: 'Word' },
  { id: 'excel',       label: 'Excel' },
  { id: 'powerpoint',  label: 'PowerPoint' },
  { id: 'pdf',         label: 'PDF' },
  { id: 'image',       label: 'Images' },
];

type DocumentsFiltersProps = {
  activeFilter: "recents" | "starred";
  fileTypeFilter: FileTypeFilter;
  onFilterChange: (filter: "recents" | "starred") => void;
  onFileTypeChange: (ft: FileTypeFilter) => void;
};

export default function DocumentsFilters({
  activeFilter,
  fileTypeFilter,
  onFilterChange,
  onFileTypeChange,
}: DocumentsFiltersProps) {
  return (
    <div className={styles.filtersRow}>
      <div className={styles.viewTabs}>
        <button
          type="button"
          className={`${styles.viewTab} ${activeFilter === 'recents' ? styles.viewTabActive : ''}`}
          onClick={() => onFilterChange('recents')}
        >
          Recent
        </button>
        <button
          type="button"
          className={`${styles.viewTab} ${activeFilter === 'starred' ? styles.viewTabActive : ''}`}
          onClick={() => onFilterChange('starred')}
        >
          Starred
        </button>
      </div>
      <div className={styles.fileTypeTabs}>
        {FILE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.fileTypeTab} ${fileTypeFilter === tab.id ? styles.fileTypeTabActive : ''}`}
            onClick={() => onFileTypeChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
