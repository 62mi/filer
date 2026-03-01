export interface FileEntry {
  name: string;
  path: string;
  size: number;
  modified: number;
  is_dir: boolean;
  is_hidden: boolean;
  is_symlink: boolean;
  extension: string;
}

export interface DriveInfo {
  name: string;
  path: string;
  display_name: string;
  icon: string | null;
}

export interface RecentFile {
  name: string;
  path: string;
  location: string;
  extension: string;
  size: number;
  accessed: number;
  is_dir: boolean;
}

export type SortKey = "name" | "size" | "modified" | "extension";
export type SortOrder = "asc" | "desc";

// フィルタチップ
export type FileTypeCategory = "folder" | "image" | "video" | "audio" | "document" | "archive";
export type SizeRange = "small" | "medium" | "large" | "huge";
export type ModifiedRange = "today" | "yesterday" | "thisWeek" | "thisMonth" | "thisYear" | "older";

export interface FilterState {
  types: FileTypeCategory[];
  sizeRange: SizeRange | null;
  modifiedRange: ModifiedRange | null;
}

export interface TidinessScore {
  total: number;
  ext_score: number;
  age_score: number;
  count_score: number;
  nest_score: number;
  ext_count: number;
  file_count: number;
  dir_count: number;
  max_depth: number;
  old_file_count: number;
}
