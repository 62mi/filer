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

export async function showNativeContextMenu(
  targetIndex: number | null,
  onProperties: (entry: FileEntry) => void,
) {
  const t = getTranslation();
  const state = useExplorerStore.getState();
  const tab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
  const entries = tab.entries;
  const selectedIndices = tab.selectedIndices;
  const hasTarget = targetIndex !== null && entries[targetIndex];
  const hasSelection = selectedIndices.size > 0 || !!hasTarget;
  const clipboard = state.clipboard;
  const stackItems = state.stackItems;

  const items: (MenuItem | PredefinedMenuItem | Submenu)[] = [];

  // Open
  if (hasTarget) {
    items.push(
      await MenuItem.new({
        text: t.contextMenu.open,
        action: () => {
          const entry = entries[targetIndex!];
          if (entry.is_dir) {
            useExplorerStore.getState().loadDirectory(entry.path);
          } else {
            invoke("open_in_default_app", { path: entry.path });
          }
        },
      }),
    );
    items.push(await PredefinedMenuItem.new({ item: "Separator" }));
  }

  // Copy / Cut / Paste
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.copy}\tCtrl+C`,
      enabled: hasSelection,
      action: () => useExplorerStore.getState().clipboardCopy(),
    }),
  );
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.cut}\tCtrl+X`,
      enabled: hasSelection,
      action: () => useExplorerStore.getState().clipboardCut(),
    }),
  );
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.paste}\tCtrl+V`,
      enabled: !!clipboard,
      action: () => useExplorerStore.getState().clipboardPaste(),
    }),
  );

  items.push(await PredefinedMenuItem.new({ item: "Separator" }));

  // Delete
  items.push(
    await MenuItem.new({
      text: `${t.contextMenu.delete}\tDel`,
      enabled: hasSelection,
      action: () => useExplorerStore.getState().deleteSelected(),
    }),
  );

  // Rename
  if (hasTarget) {
    items.push(
      await MenuItem.new({
        text: `${t.contextMenu.rename}\tF2`,
        action: () => useExplorerStore.getState().startRename(targetIndex!),
      }),
    );
  }

  // Stack operations
  if (hasSelection) {
    items.push(
      await MenuItem.new({
        text: t.contextMenu.addToStack,
        action: () => {
          const indices =
            selectedIndices.size > 0
              ? Array.from(selectedIndices)
              : targetIndex !== null
                ? [targetIndex]
                : [];
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

  // Folder Rules / AI
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

  // New Folder / New File
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

  // Templates submenu
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

  // Properties
  if (hasTarget) {
    items.push(await PredefinedMenuItem.new({ item: "Separator" }));
    items.push(
      await MenuItem.new({
        text: `${t.contextMenu.properties}\tAlt+Enter`,
        action: () => onProperties(entries[targetIndex!]),
      }),
    );
  }

  const menu = await Menu.new({ items });
  await menu.popup();
}
