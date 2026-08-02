export type ProjectStatus = 'active' | 'archived';

export type ItemStatus = 'uploading' | 'active' | 'empty' | 'failed';

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  pairing_code: string;
  next_position: number;
  preferred_density: number;
  status: ProjectStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  // Campos calculados en frontend
  active_count?: number;
  empty_count?: number;
}

export interface ProjectItem {
  id: string;
  project_id: string;
  position: number;
  status: ItemStatus;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  captured_at: string | null;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  error_message: string | null;
  // URL firmada o resuelta para renderizar
  public_url?: string;
}

export interface PendingUpload {
  id: string;
  item_id: string;
  project_id: string;
  position: number;
  file: File | Blob;
  filename: string;
  timestamp: number;
  retry_count: number;
  status: 'pending' | 'uploading' | 'failed';
  error_message?: string;
}

export type GridDensity = 6 | 10 | 15 | 20 | 'auto';
