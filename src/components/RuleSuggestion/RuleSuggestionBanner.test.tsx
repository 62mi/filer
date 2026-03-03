import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useExplorerStore } from "../../stores/panelStore";
import { type RuleSuggestion, useRuleSuggestionStore } from "../../stores/ruleSuggestionStore";
import { RuleSuggestionBanner } from "./RuleSuggestionBanner";

// ヘルパー: テスト用サジェスト生成
function makeSuggestion(overrides: Partial<RuleSuggestion> = {}): RuleSuggestion {
  return {
    ruleId: "rule-1",
    ruleName: "テストルール",
    fileName: "test.txt",
    filePath: "C:\\test\\test.txt",
    actionType: "move",
    actionDest: "C:\\test\\Archive",
    timestamp: Date.now(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  useRuleSuggestionStore.setState({ suggestions: [] });
});

// panelStore のタブパスを設定
function setTabPath(path: string) {
  useExplorerStore.setState({
    activeTabId: "tab1",
    tabs: [
      {
        id: "tab1",
        path,
        history: [path],
        historyIndex: 0,
        entries: [],
        selectedIndices: new Set(),
        cursorIndex: -1,
        loading: false,
        error: null,
        sortKey: "name",
        sortOrder: "asc",
        viewMode: "details",
        searchQuery: "",
        searchResults: null,
        searching: false,
        renamingIndex: null,
        pendingRenamePath: null,
        filter: { types: [], sizeRange: null, modifiedRange: null },
        displayStateCache: new Map(),
      },
    ],
  });
}

describe("RuleSuggestionBanner — 削除対応", () => {
  beforeEach(() => {
    setTabPath("C:\\test");
  });

  it("削除サジェストがある場合、バナーが赤色になる", () => {
    useRuleSuggestionStore.setState({
      suggestions: [
        makeSuggestion({
          actionType: "delete",
          actionDest: null,
          filePath: "C:\\test\\temp.tmp",
          fileName: "temp.tmp",
        }),
      ],
    });

    const { container } = render(<RuleSuggestionBanner />);

    const banner = container.firstElementChild;
    expect(banner?.className).toContain("border-red-200");
    expect(banner?.className).toContain("bg-red-50");
  });

  it("移動サジェストのみの場合、バナーはamber色のまま", () => {
    useRuleSuggestionStore.setState({
      suggestions: [makeSuggestion({ filePath: "C:\\test\\doc.pdf", fileName: "doc.pdf" })],
    });

    const { container } = render(<RuleSuggestionBanner />);

    const banner = container.firstElementChild;
    expect(banner?.className).toContain("border-amber-200");
    expect(banner?.className).toContain("bg-amber-50");
  });

  it("削除サジェストでは「常に実行」ボタンが非表示", () => {
    useRuleSuggestionStore.setState({
      suggestions: [
        makeSuggestion({
          actionType: "delete",
          actionDest: null,
          filePath: "C:\\test\\temp.tmp",
          fileName: "temp.tmp",
        }),
      ],
    });

    render(<RuleSuggestionBanner />);

    expect(screen.queryByText("常に実行")).not.toBeInTheDocument();
  });

  it("移動サジェストでは「常に実行」ボタンが表示される", () => {
    useRuleSuggestionStore.setState({
      suggestions: [makeSuggestion({ filePath: "C:\\test\\doc.pdf", fileName: "doc.pdf" })],
    });

    render(<RuleSuggestionBanner />);

    expect(screen.getByText("常に実行")).toBeInTheDocument();
  });

  it("削除サジェストの受理時に確認ダイアログが表示される", () => {
    useRuleSuggestionStore.setState({
      suggestions: [
        makeSuggestion({
          actionType: "delete",
          actionDest: null,
          filePath: "C:\\test\\temp.tmp",
          fileName: "temp.tmp",
        }),
      ],
    });

    render(<RuleSuggestionBanner />);

    // 「削除」ボタンをクリック
    fireEvent.click(screen.getByText("ゴミ箱へ"));

    expect(screen.getByText(/をゴミ箱に送ります/)).toBeInTheDocument();
    // 確認ダイアログ内のボタン（元のアクションボタン + 確認ボタン = 2つ）
    expect(screen.getAllByText("ゴミ箱へ")).toHaveLength(2);
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
  });

  it("確認ダイアログのキャンセルでダイアログが閉じる", () => {
    useRuleSuggestionStore.setState({
      suggestions: [
        makeSuggestion({
          actionType: "delete",
          actionDest: null,
          filePath: "C:\\test\\temp.tmp",
          fileName: "temp.tmp",
        }),
      ],
    });

    render(<RuleSuggestionBanner />);

    fireEvent.click(screen.getByText("ゴミ箱へ"));
    fireEvent.click(screen.getByText("キャンセル"));

    expect(screen.queryByText(/をゴミ箱に送ります/)).not.toBeInTheDocument();
  });

  it("削除アイテムの背景が赤系になる", () => {
    useRuleSuggestionStore.setState({
      suggestions: [
        makeSuggestion({
          actionType: "delete",
          actionDest: null,
          filePath: "C:\\test\\temp.tmp",
          fileName: "temp.tmp",
        }),
      ],
    });

    const { container } = render(<RuleSuggestionBanner />);

    const item = container.querySelector(".border-red-200\\/60");
    expect(item).toBeInTheDocument();
  });

  it("削除アイコン（AlertTriangle）がヘッダーに表示される", () => {
    useRuleSuggestionStore.setState({
      suggestions: [
        makeSuggestion({
          actionType: "delete",
          actionDest: null,
          filePath: "C:\\test\\temp.tmp",
          fileName: "temp.tmp",
        }),
      ],
    });

    const { container } = render(<RuleSuggestionBanner />);

    const alertIcon = container.querySelector("[data-icon='AlertTriangle']");
    expect(alertIcon).toBeInTheDocument();
  });
});
