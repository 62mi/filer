import { invoke } from "@tauri-apps/api/core";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getTranslation } from "../../i18n";
import { useAiStore } from "../../stores/aiStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useRuleStore } from "../../stores/ruleStore";
import { useRuleWizardStore } from "../../stores/ruleWizardStore";
import { useTemplateStore } from "../../stores/templateStore";
import { toast } from "../../stores/toastStore";
import { useUndoStore } from "../../stores/undoStore";
import type { FileEntry } from "../../types";

/** ファイル/フォルダ右クリック時のコンテキストメニュー */
async function buildFileMenu(
  targetIndex: number,
  onProperties: (entry: FileEntry) => void,
): Promise<(MenuItem | PredefinedMenuItem | Submenu)[]> {
  const t = getTranslation();
  const state = useExplorerStore.getState();
  const tab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
  const entries = tab.entries;
  const selectedIndices = tab.selectedIndices;
  const entry = entries[targetIndex];
  const hasSelection = selectedIndices.size > 0 || !!entry;
  const clipboard = state.clipboard;
  const stackItems = state.stackItems;

  // OSクリップボードにファイルがあるか事前チェック
  let osHasFiles = false;
  try {
    const osResult = await invoke<{ paths: string[]; operation: string } | null>(
      "clipboard_read_files",
    );
    osHasFiles = !!osResult && osResult.paths.length > 0;
  } catch {
    // 読み取り失敗時は内部クリップボードだけで判定
  }

  const items: (MenuItem | PredefinedMenuItem | Submenu)[] = [];

  // ── 開く ──
  items.push(
    await MenuItem.new({
      text: t.contextMenu.open,
      action: () => {
        if (entry.is_dir) {
          useExplorerStore.getState().loadDirectory(entry.path);
        } else {
          invoke("open_in_default_app", { path: entry.path }).catch(() => {});
        }
      },
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── プログラムから開く（ファイルのみ） ──
  if (!entry.is_dir) {
    items.push(
      await MenuItem.new({
        text: t.contextMenu.openWith,
        action: () => {
          invoke("open_with_dialog", { path: entry.path }).catch(() => {});
        },
      }),
    );
  }

  // ── エクスプローラーで開く ──
  items.push(
    await MenuItem.new({
      text: t.contextMenu.openInExplorer,
      action: () => {
        invoke("open_in_explorer", { path: entry.path }).catch(() => {});
      },
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── スタック操作 ──
  if (hasSelection) {
    items.push(
      await MenuItem.new({
        text: t.contextMenu.addToStack,
        action: () => {
          const indices = selectedIndices.size > 0 ? Array.from(selectedIndices) : [targetIndex];
          const paths = indices.map((i) => entries[i]?.path).filter(Boolean);
          if (paths.length > 0) useExplorerStore.getState().addToStack(paths);
        },
      }),
    );
  }
  if (stackItems.length > 0) {
    items.push(
      await MenuItem.new({
        text: `${t.contextMenu.pasteFromStackMove} (${stackItems.length})`,
        action: () => useExplorerStore.getState().pasteFromStack("move"),
      }),
    );
    items.push(
      await MenuItem.new({
        text: `${t.contextMenu.pasteFromStackCopy} (${stackItems.length})`,
        action: () => useExplorerStore.getState().pasteFromStack("copy"),
      }),
    );
  }

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── パスのコピー ──
  items.push(
    await MenuItem.new({
      text: t.contextMenu.copyPath,
      action: async () => {
        const indices = selectedIndices.size > 0 ? Array.from(selectedIndices) : [targetIndex];
        const paths = indices.map((i) => entries[i]?.path).filter(Boolean);
        const text = paths.join("\n");
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // フォールバック: 最初のパスだけコピー
          await navigator.clipboard.writeText(paths[0] || "");
        }
      },
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── ルール / AI ──
  items.push(
    await MenuItem.new({
      text: t.contextMenu.folderRules,
      action: () => useRuleStore.getState().openDialog(tab.path),
    }),
  );
  items.push(
    await MenuItem.new({
      text: t.contextMenu.aiRuleWizard,
      action: () => useRuleWizardStore.getState().openWizard(tab.path),
    }),
  );
  items.push(
    await MenuItem.new({
      text: t.contextMenu.aiAutoOrganize,
      action: () => useAiStore.getState().openDialog(tab.path, tab.id),
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── 切り取り / コピー / 貼り付け / 削除 / 名前の変更 ──
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.cut}\tCtrl+X`,
      enabled: hasSelection,
      action: () => useExplorerStore.getState().clipboardCut(),
    }),
  );
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.copy}\tCtrl+C`,
      enabled: hasSelection,
      action: () => useExplorerStore.getState().clipboardCopy(),
    }),
  );
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.paste}\tCtrl+V`,
      enabled: !!clipboard || osHasFiles,
      action: () => useExplorerStore.getState().clipboardPaste(),
    }),
  );
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.delete}\tDel`,
      enabled: hasSelection,
      action: () => useExplorerStore.getState().deleteSelected(),
    }),
  );
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.rename}\tF2`,
      action: () => useExplorerStore.getState().startRename(targetIndex),
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── プロパティ ──
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.properties}\tAlt+Enter`,
      action: () => onProperties(entry),
    }),
  );

  return items;
}

/** 背景（空白領域）右クリック時のコンテキストメニュー */
async function buildBackgroundMenu(
  onProperties: (entry: FileEntry) => void,
): Promise<(MenuItem | PredefinedMenuItem | Submenu)[]> {
  const t = getTranslation();
  const state = useExplorerStore.getState();
  const tab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
  const clipboard = state.clipboard;
  const stackItems = state.stackItems;

  // OSクリップボードにファイルがあるか事前チェック
  let osHasFiles = false;
  try {
    const osResult = await invoke<{ paths: string[]; operation: string } | null>(
      "clipboard_read_files",
    );
    osHasFiles = !!osResult && osResult.paths.length > 0;
  } catch {
    // 読み取り失敗時は内部クリップボードだけで判定
  }

  const items: (MenuItem | PredefinedMenuItem | Submenu)[] = [];

  // ── 表示サブメニュー ──
  const currentViewMode = tab.viewMode;
  const viewSubItems = [
    await MenuItem.new({
      text: `${currentViewMode === "details" ? "● " : "  "}${t.contextMenu.viewDetails}`,
      action: () => useExplorerStore.getState().setViewMode("details"),
    }),
    await MenuItem.new({
      text: `${currentViewMode === "icons" ? "● " : "  "}${t.contextMenu.viewMediumIcons}`,
      action: () => useExplorerStore.getState().setViewMode("icons"),
    }),
  ];
  items.push(
    await Submenu.new({
      text: t.contextMenu.view,
      items: viewSubItems,
    }),
  );

  // ── 並べ替えサブメニュー ──
  const currentSortKey = tab.sortKey;
  const sortOptions: { key: string; label: string }[] = [
    { key: "name", label: t.contextMenu.sortByName },
    { key: "modified", label: t.contextMenu.sortByModified },
    { key: "extension", label: t.contextMenu.sortByType },
    { key: "size", label: t.contextMenu.sortBySize },
  ];
  const sortSubItems: MenuItem[] = [];
  for (const opt of sortOptions) {
    sortSubItems.push(
      await MenuItem.new({
        text: `${currentSortKey === opt.key ? "● " : "  "}${opt.label}`,
        action: () =>
          useExplorerStore
            .getState()
            .setSort(opt.key as "name" | "modified" | "extension" | "size"),
      }),
    );
  }
  items.push(
    await Submenu.new({
      text: t.contextMenu.sortBy,
      items: sortSubItems,
    }),
  );

  // ── 最新の情報に更新 ──
  items.push(
    await MenuItem.new({
      text: t.contextMenu.refresh,
      action: () => useExplorerStore.getState().refreshDirectory(),
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── 貼り付け / スタック ──
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.paste}\tCtrl+V`,
      enabled: !!clipboard || osHasFiles,
      action: () => useExplorerStore.getState().clipboardPaste(),
    }),
  );
  if (stackItems.length > 0) {
    items.push(
      await MenuItem.new({
        text: `${t.contextMenu.pasteFromStackMove} (${stackItems.length})`,
        action: () => useExplorerStore.getState().pasteFromStack("move"),
      }),
    );
    items.push(
      await MenuItem.new({
        text: `${t.contextMenu.pasteFromStackCopy} (${stackItems.length})`,
        action: () => useExplorerStore.getState().pasteFromStack("copy"),
      }),
    );
  }

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── ルール / AI ──
  items.push(
    await MenuItem.new({
      text: t.contextMenu.folderRules,
      action: () => useRuleStore.getState().openDialog(tab.path),
    }),
  );
  items.push(
    await MenuItem.new({
      text: t.contextMenu.aiRuleWizard,
      action: () => useRuleWizardStore.getState().openWizard(tab.path),
    }),
  );
  items.push(
    await MenuItem.new({
      text: t.contextMenu.aiAutoOrganize,
      action: () => useAiStore.getState().openDialog(tab.path, tab.id),
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── 新規作成 ──
  items.push(
    await MenuItem.new({
      text: t.contextMenu.newFolder,
      action: () => useExplorerStore.getState().createNewFolder(),
    }),
  );
  items.push(
    await MenuItem.new({
      text: t.contextMenu.newFile,
      action: () => useExplorerStore.getState().createNewFile(),
    }),
  );

  // テンプレートサブメニュー
  if (!useTemplateStore.getState().loaded) {
    useTemplateStore.getState().loadTemplates();
  }
  const templates = useTemplateStore.getState().templates;
  const templateSubItems: MenuItem[] = [];
  for (const tmpl of templates) {
    templateSubItems.push(
      await MenuItem.new({
        text: tmpl.name,
        action: async () => {
          try {
            const createdPaths: string[] = await invoke("create_from_template", {
              basePath: tab.path,
              nodes: tmpl.nodes,
            });
            if (createdPaths.length > 0) {
              useUndoStore.getState().pushAction({
                type: "create_dir",
                entries: createdPaths.map((p) => ({
                  sourcePath: "",
                  destPath: p,
                })),
              });
            }
            toast.success(`${t.panel.templateDeployed}: ${tmpl.name}`);
            useExplorerStore.getState().refreshDirectory();
          } catch (err: unknown) {
            toast.error(
              `${t.panel.templateDeployFailed}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }),
    );
  }
  templateSubItems.push(
    await MenuItem.new({
      text: t.contextMenu.templateManager,
      action: () => useTemplateStore.getState().openDialog(),
    }),
  );
  items.push(
    await Submenu.new({
      text: t.contextMenu.createFromTemplate,
      items: templateSubItems,
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── ターミナルで開く ──
  items.push(
    await MenuItem.new({
      text: t.contextMenu.openTerminal,
      action: () => {
        invoke("open_terminal", { terminal: "wt", cwd: tab.path }).catch(() => {
          // Windows Terminal未インストール時はPowerShellにフォールバック
          invoke("open_terminal", { terminal: "powershell", cwd: tab.path }).catch(
            (err: unknown) => {
              toast.error(
                `${t.navigationBar.terminalFailed}: ${err instanceof Error ? err.message : String(err)}`,
              );
            },
          );
        });
      },
    }),
  );

  // ── エクスプローラーで開く ──
  items.push(
    await MenuItem.new({
      text: t.contextMenu.openInExplorer,
      action: () => {
        invoke("open_in_explorer", { path: tab.path }).catch(() => {});
      },
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // ── プロパティ（現在のフォルダ） ──
  const folderName = tab.path.split("\\").pop() || tab.path;
  const folderEntry: FileEntry = {
    name: folderName,
    path: tab.path,
    is_dir: true,
    is_hidden: false,
    is_symlink: false,
    size: 0,
    modified: 0,
    extension: "",
  };
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.properties}\tAlt+Enter`,
      action: () => onProperties(folderEntry),
    }),
  );

  return items;
}

export async function showNativeContextMenu(
  targetIndex: number | null,
  onProperties: (entry: FileEntry) => void,
) {
  const state = useExplorerStore.getState();
  const tab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
  const entries = tab.entries;

  let items: (MenuItem | PredefinedMenuItem | Submenu)[];

  if (targetIndex !== null && entries[targetIndex]) {
    items = await buildFileMenu(targetIndex, onProperties);
  } else {
    items = await buildBackgroundMenu(onProperties);
  }

  const menu = await Menu.new({ items });
  await menu.popup();
}
