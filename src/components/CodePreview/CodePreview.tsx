import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

/** 拡張子 → Prism言語名マッピング */
const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  html: "markup",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sh: "bash",
  bat: "batch",
  ps1: "powershell",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  java: "java",
  go: "go",
  rb: "ruby",
  php: "php",
  sql: "sql",
  graphql: "graphql",
  vue: "markup",
  svelte: "markup",
  astro: "markup",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  dart: "dart",
  r: "r",
  lua: "lua",
  scala: "scala",
  cs: "csharp",
  fs: "fsharp",
  proto: "protobuf",
  makefile: "makefile",
  cmake: "cmake",
  dockerfile: "docker",
  diff: "diff",
  patch: "diff",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
};

interface CodePreviewProps {
  content: string;
  extension: string;
  /** フォントサイズ(px) */
  fontSize?: number;
}

export function CodePreview({ content, extension, fontSize = 12 }: CodePreviewProps) {
  const language = EXT_TO_LANG[extension.toLowerCase()] ?? "text";

  return (
    <SyntaxHighlighter
      language={language}
      style={oneLight}
      customStyle={{
        margin: 0,
        borderRadius: "8px",
        fontSize: `${fontSize}px`,
        lineHeight: 1.5,
        border: "1px solid #e5e5e5",
      }}
      showLineNumbers
      lineNumberStyle={{ minWidth: "2.5em", color: "#bbb", fontSize: `${fontSize}px` }}
    >
      {content}
    </SyntaxHighlighter>
  );
}
