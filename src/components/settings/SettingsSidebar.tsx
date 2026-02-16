"use client";
import React from 'react';
import styles from './settingsSidebar.module.css';

type Item = { label: string; key: string };
const menuItems: Item[] = [
  { label: 'Account Info', key: 'account' },
  { label: 'Case Profile', key: 'case-profile' },
  { label: 'Billing & Plans', key: 'billing' },
  { label: 'Contact Us', key: 'contact' },
];

export default function SettingsSidebar({ active, onSelect }: { active: string; onSelect: (key: string) => void }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.menu}>
        {menuItems.map(item => (
          <button
            key={item.key}
            className={`${styles.menuItem} ${active === item.key ? styles.menuItemActive : ''}`}
            onClick={() => onSelect(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
