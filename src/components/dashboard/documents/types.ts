export interface Document {
  id: string;
  title: string;
  content: string;
  type: string;
  createdAt: string;
  starred?: boolean;
  folderId?: string;
  size?: number;
  mimeType?: string | null;
  storagePath?: string | null;
  storageUrl?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  kind?: 'case' | 'custom';
  locked?: boolean;
}
