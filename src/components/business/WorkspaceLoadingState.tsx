"use client";

import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import styles from './workspaceLoadingState.module.css';

type WorkspaceLoadingStateProps = {
  label: string;
  description?: string;
  variant?: 'panel' | 'inline';
  className?: string;
  Icon?: LucideIcon;
};

export default function WorkspaceLoadingState({
  label,
  description,
  variant = 'panel',
  className,
  Icon = Loader2,
}: WorkspaceLoadingStateProps) {
  const rootClassName = [
    styles.loadingState,
    variant === 'inline' ? styles.inline : styles.panel,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName} role="status" aria-live="polite" aria-busy="true">
      <Icon size={variant === 'inline' ? 14 : 18} className={`${styles.icon} ${styles.spin}`} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      {description ? <span className={styles.description}>{description}</span> : null}
    </div>
  );
}
