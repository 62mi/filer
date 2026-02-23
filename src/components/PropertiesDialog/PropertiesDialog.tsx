import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FileEntry } from "../../types";
import { getFileType } from "../../utils/fileType";
import { formatDate, formatFileSize } from "../../utils/format";
import { FileIcon } from "../Panel/FileIcon";

interface FileProperties {
  name: string;
  path: string;
  size: number;
  created: number;
  modified: number;
  accessed: number;
  is_dir: boolean;
  is_readonly: boolean;
  is_hidden: boolean;
  is_system: boolean;
  file_count: number;
  dir_count: number;
}

interface PropertiesDialogProps {
  entry: FileEntry;
  onClose: () => void;
}

export function PropertiesDialog({ entry, onClose }: PropertiesDialogProps) {
  const [props, setProps] = useState<FileProperties | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoke<FileProperties>("get_file_properties", { path: entry.path })
      .then((p) => {
        setProps(p);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [entry.path]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const rows: { label: string; value: string }[] = props
    ? [
        { label: "Type", value: props.is_dir ? "File Folder" : getFileType(entry) },
        { label: "Location", value: props.path.substring(0, props.path.lastIndexOf("\\")) },
        {
          label: "Size",
          value: props.is_dir
            ? `${formatFileSize(props.size)} (${props.file_count} files, ${props.dir_count} folders)`
            : formatFileSize(props.size),
        },
        { label: "Created", value: formatDate(props.created) },
        { label: "Modified", value: formatDate(props.modified) },
        { label: "Accessed", value: formatDate(props.accessed) },
      ]
    : [];

  const attrs: string[] = [];
  if (props) {
    if (props.is_readonly) attrs.push("Read-only");
    if (props.is_hidden) attrs.push("Hidden");
    if (props.is_system) attrs.push("System");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-[#e0e0e0] w-96 max-h-[80vh] flex flex-col animate-fade-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center h-10 px-4 border-b border-[#e5e5e5] shrink-0">
          <span className="font-semibold text-sm text-[#1a1a1a] flex-1 truncate">
            {entry.name} Properties
          </span>
          <button
            className="p-1 rounded hover:bg-[#e8e8e8] text-[#666] transition-colors duration-100"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-[#999]">
              Loading properties...
            </div>
          ) : props ? (
            <div className="space-y-4">
              {/* File icon and name */}
              <div className="flex items-center gap-3 pb-3 border-b border-[#e5e5e5]">
                <FileIcon
                  isDir={entry.is_dir}
                  extension={entry.extension}
                  className={`w-8 h-8 ${entry.is_dir ? "text-amber-500" : "text-[#666]"}`}
                />
                <span className="text-sm font-medium text-[#1a1a1a] break-all">{props.name}</span>
              </div>

              {/* Property rows */}
              <div className="space-y-2">
                {rows.map((row) => (
                  <div key={row.label} className="flex text-sm">
                    <span className="w-24 text-[#666] shrink-0">{row.label}:</span>
                    <span className="text-[#1a1a1a] break-all">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Attributes */}
              {attrs.length > 0 && (
                <div className="pt-3 border-t border-[#e5e5e5]">
                  <div className="flex text-sm">
                    <span className="w-24 text-[#666] shrink-0">Attributes:</span>
                    <span className="text-[#1a1a1a]">{attrs.join(", ")}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-[#999]">
              Failed to load properties
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-[#e5e5e5] shrink-0">
          <button
            className="px-6 py-1.5 text-sm bg-[#f0f0f0] hover:bg-[#e0e0e0] rounded border border-[#d0d0d0] text-[#1a1a1a] transition-colors"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
