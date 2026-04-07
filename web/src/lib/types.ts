export interface LibraryItem {
  id: string;
  name: string;
  type: "Movie" | "Series" | "Season";
  parent_id: string | null;
  has_poster: boolean;
  has_backdrop: boolean;
  has_landscape: boolean;
  poster_status: "original" | "swapped" | "failed" | "pending";
  backdrop_status: "original" | "swapped" | "failed" | "pending";
  landscape_status: "original" | "swapped" | "failed" | "pending";
  poster_face_id: number | null;
  backdrop_face_id: number | null;
  landscape_face_id: number | null;
  year: number | null;
  last_synced: string | null;
}

export interface LibraryResponse {
  items: LibraryItem[];
  total: number;
}

export interface Face {
  id: number;
  filename: string;
  gender: "male" | "female";
  usage_count: number;
  created_at: string | null;
}

export interface Job {
  id: number;
  mode: "instant" | "batch";
  image_type: "poster" | "backdrop" | "both";
  backend: string;
  status: "pending" | "running" | "batch_pending" | "completed" | "failed" | "cancelled";
  gemini_batch_id: string | null;
  total_items: number;
  completed_items: number;
  failed_items: number;
  skipped_items: number;
  created_at: string | null;
  completed_at: string | null;
}

export interface JobItem {
  id: number;
  job_id: number;
  item_id: string;
  item_name: string | null;
  face_id: number | null;
  image_type: string;
  status: string;
  analysis: Record<string, unknown> | null;
  error: string | null;
  backup_path: string | null;
  created_at: string | null;
}

export interface JobDetail {
  job: Job;
  items: JobItem[];
}

export interface Settings {
  jellyfin_url: string;
  jellyfin_api_key: string;
  gemini_api_key: string;
  anthropic_api_key: string;
  fal_key: string;
  jellyfin_configured: boolean;
  gemini_configured: boolean;
  anthropic_configured: boolean;
  fal_configured: boolean;
  backdrop_upload: string;
  media_ssh: string;
  analysis_backend: string;
  swap_backend: string;
  missing: string[];
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details: Record<string, unknown> | null;
}
