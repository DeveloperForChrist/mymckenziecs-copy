"use client";
import styles from './settingsSidebar.module.css';
import type { PublicMarket } from '@/lib/markets/public-routes';

type Item = { label: string; key: string };

export default function SettingsSidebar({
  active,
  onSelect,
  publicMarket = 'GB',
}: {
  active: string;
  onSelect: (key: string) => void;
  publicMarket?: PublicMarket;
}) {
  const menuItems: Item[] = [
    { label: 'Account Info', key: 'account' },
    { label: 'Billing & Plans', key: 'billing' },
    { label: publicMarket === 'US' ? 'U.S. Support' : 'Contact Us', key: 'contact' },
  ];

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
