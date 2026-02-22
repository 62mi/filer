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
}

export type SortKey = "name" | "size" | "modified" | "extension";
export type SortOrder = "asc" | "desc";
