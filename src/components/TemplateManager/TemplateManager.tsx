import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useExplorerStore } from "../../stores/panelStore";
import {
  type Template,
  type TemplateNode,
  useTemplateStore,
} from "../../stores/templateStore";
import { toast } from "../../stores/toastStore";
import { useUndoStore } from "../../stores/undoStore";

export function TemplateManager() {
  const isOpen = useTemplateStore((s) => s.isDialogOpen);
  const templates = useTemplateStore((s) => s.templates);
  const closeDialog = useTemplateStore((s) => s.closeDialog);
  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const updateTemplate = useTemplateStore((s) => s.updateTemplate);
  const removeTemplate = useTemplateStore((s) => s.removeTemplate);
  const loaded = useTemplateStore((s) => s.loaded);

  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editName, setEditName] = useState("");
  const [editNodes, setEditNodes] = useState<TemplateNode[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemType, setNewItemType] = useState<"directory" | "file">("directory");
  const [addingPath, setAddingPath] = useState<number[] | null>(null);

  useEffect(() => {
    if (isOpen && !loaded) {
      useTemplateStore.getState().loadTemplates();
    }
  }, [isOpen, loaded]);

  useEffect(() => {
    if (!isOpen) {
      setEditingTemplate(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const startEdit = (template: Template) => {
    setEditingTemplate(template);
    setEditName(template.name);
    setEditNodes(JSON.parse(JSON.stringify(template.nodes)));
    setAddingPath(null);
  };

  const startNew = () => {
    setEditingTemplate({
      id: "",
      name: "",
      builtin: false,
      nodes: [],
    });
    setEditName("");
    setEditNodes([]);
    setAddingPath(null);
  };

  const saveEdit = () => {
    if (!editName.trim()) return;
    if (editingTemplate?.id) {
      updateTemplate(editingTemplate.id, editName.trim(), editNodes);
    } else {
      addTemplate(editName.trim(), editNodes);
    }
    setEditingTemplate(null);
  };

  const addNodeAt = (path: number[]) => {
    if (!newItemName.trim()) return;
    const newNode: TemplateNode = {
      name: newItemName.trim(),
      type: newItemType,
      ...(newItemType === "directory" ? { children: [] } : {}),
    };

    const updated = JSON.parse(JSON.stringify(editNodes)) as TemplateNode[];
    if (path.length === 0) {
      updated.push(newNode);
    } else {
      let target: TemplateNode[] = updated;
      for (const idx of path) {
        const node = target[idx];
        if (!node.children) node.children = [];
        target = node.children;
      }
      target.push(newNode);
    }

    setEditNodes(updated);
    setNewItemName("");
    setAddingPath(null);
  };

  const removeNodeAt = (path: number[]) => {
    const updated = JSON.parse(JSON.stringify(editNodes)) as TemplateNode[];
    if (path.length === 1) {
      updated.splice(path[0], 1);
    } else {
      let target: TemplateNode[] = updated;
      for (let i = 0; i < path.length - 1; i++) {
        const node = target[path[i]];
        if (!node.children) return;
        target = node.children;
      }
      target.splice(path[path.length - 1], 1);
    }
    setEditNodes(updated);
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      <div className="w-[600px] max-h-[80vh] bg-white rounded-xl shadow-2xl border border-[#d0d0d0] flex flex-col animate-fade-scale-in">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e5e5]">
          <h2 className="font-semibold text-base">テンプレート管理</h2>
          <button
            className="p-1 rounded hover:bg-[#e8e8e8] text-[#999]"
            onClick={closeDialog}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {editingTemplate === null ? (
            /* テンプレート一覧 */
            <div className="space-y-2">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[#e5e5e5] hover:border-[#0078d4] transition-colors"
                >
                  <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{tmpl.name}</div>
                    <div className="text-xs text-[#999]">
                      {countNodes(tmpl.nodes)} items
                      {tmpl.builtin && " (builtin)"}
                    </div>
                  </div>
                  <button
                    className="p-1 rounded hover:bg-blue-50 text-[#0078d4]"
                    onClick={async () => {
                      try {
                        const tab = useExplorerStore.getState().getActiveTab();
                        const createdPaths: string[] = await invoke("create_from_template", {
                          basePath: tab.path,
                          nodes: tmpl.nodes,
                        });
                        if (createdPaths.length > 0) {
                          useUndoStore.getState().pushAction({
                            type: "create_dir",
                            entries: createdPaths.map((p) => ({ sourcePath: "", destPath: p })),
                          });
                        }
                        toast.success(`テンプレート「${tmpl.name}」を展開しました`);
                        useExplorerStore.getState().refreshDirectory();
                        closeDialog();
                      } catch (err) {
                        toast.error(`テンプレート展開に失敗: ${err}`);
                      }
                    }}
                    title="現在のフォルダに展開"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-[#e8e8e8] text-[#999]"
                    onClick={() => startEdit(tmpl)}
                    title="編集"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-red-50 text-[#999] hover:text-red-500"
                    onClick={() => removeTemplate(tmpl.id)}
                    title="削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#0078d4] rounded-lg border border-dashed border-[#ccc] hover:border-[#0078d4] transition-colors"
                onClick={startNew}
              >
                <Plus className="w-4 h-4" />
                新しいテンプレート
              </button>
            </div>
          ) : (
            /* テンプレート編集 */
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#666] mb-1">テンプレート名</label>
                <input
                  type="text"
                  className="w-full px-3 py-1.5 text-sm border border-[#d0d0d0] rounded-lg outline-none focus:border-[#0078d4]"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="My Template"
                />
              </div>

              <div>
                <label className="block text-xs text-[#666] mb-1">構造</label>
                <div className="border border-[#e5e5e5] rounded-lg p-2 min-h-[120px]">
                  <NodeTree
                    nodes={editNodes}
                    path={[]}
                    onRemove={removeNodeAt}
                    onAdd={(path) => {
                      setAddingPath(path);
                      setNewItemName("");
                    }}
                    addingPath={addingPath}
                  />

                  {/* ルートレベルの追加 */}
                  {addingPath !== null &&
                    addingPath.length === 0 &&
                    renderAddForm()}

                  {addingPath === null && (
                    <button
                      className="flex items-center gap-1 text-xs text-[#0078d4] mt-1 px-1 py-0.5 hover:bg-[#f0f0f0] rounded"
                      onClick={() => {
                        setAddingPath([]);
                        setNewItemName("");
                      }}
                    >
                      <Plus className="w-3 h-3" />
                      追加
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  className="px-4 py-1.5 text-sm rounded-lg border border-[#d0d0d0] hover:bg-[#f0f0f0]"
                  onClick={() => setEditingTemplate(null)}
                >
                  キャンセル
                </button>
                <button
                  className="px-4 py-1.5 text-sm rounded-lg bg-[#0078d4] text-white hover:bg-[#106ebe] disabled:opacity-50"
                  onClick={saveEdit}
                  disabled={!editName.trim()}
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function renderAddForm() {
    return (
      <div className="flex items-center gap-1 mt-1 ml-4">
        <select
          className="text-xs border border-[#d0d0d0] rounded px-1 py-0.5"
          value={newItemType}
          onChange={(e) => setNewItemType(e.target.value as "directory" | "file")}
        >
          <option value="directory">Folder</option>
          <option value="file">File</option>
        </select>
        <input
          type="text"
          className="flex-1 text-xs border border-[#d0d0d0] rounded px-2 py-0.5 outline-none focus:border-[#0078d4]"
          placeholder="名前"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addNodeAt(addingPath!);
            if (e.key === "Escape") setAddingPath(null);
          }}
          autoFocus
        />
        <button
          className="text-xs text-[#0078d4] px-1"
          onClick={() => addNodeAt(addingPath!)}
        >
          OK
        </button>
        <button
          className="text-xs text-[#999] px-1"
          onClick={() => setAddingPath(null)}
        >
          Cancel
        </button>
      </div>
    );
  }
}

/** ノードツリー表示 */
function NodeTree({
  nodes,
  path,
  onRemove,
  onAdd,
  addingPath,
}: {
  nodes: TemplateNode[];
  path: number[];
  onRemove: (path: number[]) => void;
  onAdd: (path: number[]) => void;
  addingPath: number[] | null;
}) {
  return (
    <div className="text-sm">
      {nodes.map((node, i) => {
        const currentPath = [...path, i];
        const isDir = node.type === "directory";
        const isAdding =
          addingPath !== null &&
          JSON.stringify(addingPath) === JSON.stringify(currentPath);

        return (
          <div key={i} className="group">
            <div className="flex items-center gap-1 py-0.5 px-1 rounded hover:bg-[#f5f5f5]">
              {isDir ? (
                <ChevronRight className="w-3 h-3 text-[#999]" />
              ) : (
                <span className="w-3" />
              )}
              {isDir ? (
                <Folder className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <File className="w-3.5 h-3.5 text-[#999]" />
              )}
              <span className="text-xs flex-1">{node.name}</span>
              <div className="hidden group-hover:flex items-center gap-0.5">
                {isDir && (
                  <button
                    className="p-0.5 rounded hover:bg-[#e0e0e0] text-[#999]"
                    onClick={() => onAdd(currentPath)}
                    title="子要素を追加"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
                <button
                  className="p-0.5 rounded hover:bg-red-50 text-[#999] hover:text-red-500"
                  onClick={() => onRemove(currentPath)}
                  title="削除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            {isDir && node.children && node.children.length > 0 && (
              <div className="ml-4">
                <NodeTree
                  nodes={node.children}
                  path={currentPath}
                  onRemove={onRemove}
                  onAdd={onAdd}
                  addingPath={addingPath}
                />
              </div>
            )}
            {isAdding && (
              <div className="ml-4">
                {/* addingPathのフォームはTemplateManager側でレンダリング */}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function countNodes(nodes: TemplateNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    if (node.children) count += countNodes(node.children);
  }
  return count;
}
