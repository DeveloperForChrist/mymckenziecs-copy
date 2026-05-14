'use client'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import DirectoryClient from '@/components/directory/DirectoryClient'
import styles from './dirpage.module.css'

interface Props {
  userId: string | null
}

export default function DirectoryPageClient({ userId }: Props) {
  return (
    <div className={styles.shell}>
      <div className={styles.topBar}>
        <Link href="/dashboard" className={styles.backLink}>
          <ArrowLeft size={15}/>Back to Dashboard
        </Link>
      </div>
      <div className={styles.content}>
        <DirectoryClient mode="litigant" />
      </div>
    </div>
  )
}
