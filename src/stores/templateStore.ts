import { create } from "zustand";

export interface TemplateNode {
  name: string;
  type: "directory" | "file";
  children?: TemplateNode[];
  content?: string;
}

export interface Template {
  id: string;
  name: string;
  builtin: boolean;
  nodes: TemplateNode[];
}

interface TemplateStore {
  templates: Template[];
  isDialogOpen: boolean;
  loaded: boolean;

  openDialog: () => void;
  closeDialog: () => void;
  addTemplate: (name: string, nodes: TemplateNode[]) => void;
  updateTemplate: (id: string, name: string, nodes: TemplateNode[]) => void;
  removeTemplate: (id: string) => void;
  loadTemplates: () => void;
  saveTemplates: () => void;
}

const STORAGE_KEY = "filer-templates";

const BUILTIN_TEMPLATES: Template[] = [
  {
    id: "builtin-web",
    name: "Web Project",
    builtin: true,
    nodes: [
      {
        name: "src",
        type: "directory",
        children: [
          {
            name: "index.html",
            type: "file",
            content:
              '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>Project</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <script src="main.js"></script>\n</body>\n</html>',
          },
          { name: "style.css", type: "file", content: "/* styles */\n" },
          { name: "main.js", type: "file", content: "// entry point\n" },
        ],
      },
      {
        name: "assets",
        type: "directory",
        children: [
          { name: "images", type: "directory" },
          { name: "fonts", type: "directory" },
        ],
      },
      { name: "README.md", type: "file", content: "# Project\n\n## Setup\n\n## Usage\n" },
    ],
  },
  {
    id: "builtin-game",
    name: "Game Asset",
    builtin: true,
    nodes: [
      { name: "Sprites", type: "directory" },
      {
        name: "Audio",
        type: "directory",
        children: [
          { name: "BGM", type: "directory" },
          { name: "SE", type: "directory" },
        ],
      },
      { name: "Scenes", type: "directory" },
      { name: "Scripts", type: "directory" },
      { name: "Prefabs", type: "directory" },
      { name: "Materials", type: "directory" },
    ],
  },
  {
    id: "builtin-docs",
    name: "Document Project",
    builtin: true,
    nodes: [
      {
        name: "docs",
        type: "directory",
        children: [
          { name: "drafts", type: "directory" },
          { name: "final", type: "directory" },
        ],
      },
      { name: "references", type: "directory" },
      { name: "exports", type: "directory" },
      { name: "README.md", type: "file", content: "# Document Project\n" },
    ],
  },
];

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  templates: [],
  isDialogOpen: false,
  loaded: false,

  openDialog: () => {
    if (!get().loaded) get().loadTemplates();
    set({ isDialogOpen: true });
  },
  closeDialog: () => set({ isDialogOpen: false }),

  addTemplate: (name, nodes) => {
    const template: Template = {
      id: crypto.randomUUID(),
      name,
      builtin: false,
      nodes,
    };
    set((s) => ({ templates: [...s.templates, template] }));
    get().saveTemplates();
  },

  updateTemplate: (id, name, nodes) => {
    set((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, name, nodes } : t)),
    }));
    get().saveTemplates();
  },

  removeTemplate: (id) => {
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
    get().saveTemplates();
  },

  loadTemplates: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      const saved: Template[] = data ? JSON.parse(data) : [];
      // ビルトインをマージ（保存されたビルトインで上書き）
      const savedIds = new Set(saved.map((t) => t.id));
      const merged = [...BUILTIN_TEMPLATES.filter((bt) => !savedIds.has(bt.id)), ...saved];
      set({ templates: merged, loaded: true });
    } catch {
      set({ templates: [...BUILTIN_TEMPLATES], loaded: true });
    }
  },

  saveTemplates: () => {
    const { templates } = get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch {
      // storage full
    }
  },
}));
