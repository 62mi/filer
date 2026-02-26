import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSuggestedAction } from "../../stores/aiStore";
import { useAiStore } from "../../stores/aiStore";
import { AiOrganizer } from "./AiOrganizer";

afterEach(() => {
  cleanup();
  useAiStore.setState({
    dialogOpen: false,
    dialogTabId: null,
    dialogFolderPath: null,
    phase: "input",
    suggestedActions: [],
    loading: false,
    error: null,
    executing: false,
    executionResults: null,
    hasApiKey: true,
    organizationPlan: null,
    userInstructions: "",
    progress: null,
  });
});

// ヘルパー: テスト用のアクション生成
function makeAction(overrides: Partial<AiSuggestedAction> = {}): AiSuggestedAction {
  return {
    file_path: "C:\\test\\file.txt",
    file_name: "file.txt",
    action_type: "move",
    action_dest: "C:\\test\\Documents",
    reason: "テスト",
    ...overrides,
  };
}

describe("AiOrganizer プリセット", () => {
  it("PRESTSに「不要ファイル一掃」プリセットが含まれる", () => {
    useAiStore.setState({
      dialogOpen: true,
      dialogTabId: "tab1",
      dialogFolderPath: "C:\\test",
      phase: "input",
      hasApiKey: true,
    });

    render(<AiOrganizer tabId="tab1" />);

    expect(screen.getByText("不要ファイル一掃")).toBeInTheDocument();
    expect(screen.getByText(".tmp, Thumbs.db等の不要ファイルを削除提案")).toBeInTheDocument();
  });

  it("「不要ファイル一掃」プリセットボタンが存在する", () => {
    useAiStore.setState({
      dialogOpen: true,
      dialogTabId: "tab1",
      dialogFolderPath: "C:\\test",
      phase: "input",
      hasApiKey: true,
    });

    render(<AiOrganizer tabId="tab1" />);

    const button = screen.getByText("不要ファイル一掃").closest("button");
    expect(button).toBeInTheDocument();
  });
});

describe("AiOrganizer PreviewPhase — 削除警告UI", () => {
  const moveAction = makeAction({ action_type: "move", file_name: "doc.pdf" });
  const deleteAction1 = makeAction({
    action_type: "delete",
    file_name: "temp.tmp",
    file_path: "C:\\test\\temp.tmp",
    action_dest: null,
    reason: "一時ファイル",
  });
  const deleteAction2 = makeAction({
    action_type: "delete",
    file_name: "Thumbs.db",
    file_path: "C:\\test\\Thumbs.db",
    action_dest: null,
    reason: "OSゴミ",
  });

  beforeEach(() => {
    useAiStore.setState({
      dialogOpen: true,
      dialogTabId: "tab1",
      dialogFolderPath: "C:\\test",
      phase: "preview",
      hasApiKey: true,
      executing: false,
      error: null,
    });
  });

  it("削除アクションがある場合、ヘッダーに削除件数が表示される", () => {
    useAiStore.setState({
      suggestedActions: [moveAction, deleteAction1, deleteAction2],
    });

    render(<AiOrganizer tabId="tab1" />);

    expect(screen.getByText(/2件の削除を含む/)).toBeInTheDocument();
  });

  it("削除アクションがない場合、削除警告は表示されない", () => {
    useAiStore.setState({
      suggestedActions: [moveAction],
    });

    render(<AiOrganizer tabId="tab1" />);

    expect(screen.queryByText(/件の削除を含む/)).not.toBeInTheDocument();
  });

  it("削除を含む実行時、確認ダイアログが表示される", () => {
    useAiStore.setState({
      suggestedActions: [moveAction, deleteAction1],
      executeActions: vi.fn(),
    });

    render(<AiOrganizer tabId="tab1" />);

    const executeButton = screen.getByText(/件を実行/);
    fireEvent.click(executeButton);

    expect(screen.getByText(/ファイルをゴミ箱に送ります/)).toBeInTheDocument();
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
    expect(screen.getByText("削除を実行")).toBeInTheDocument();
  });

  it("確認ダイアログのキャンセルで閉じる", () => {
    const mockExecute = vi.fn();
    useAiStore.setState({
      suggestedActions: [deleteAction1],
      executeActions: mockExecute,
    });

    render(<AiOrganizer tabId="tab1" />);

    fireEvent.click(screen.getByText(/件を実行/));
    expect(screen.getByText(/ファイルをゴミ箱に送ります/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("キャンセル"));
    expect(screen.queryByText(/ファイルをゴミ箱に送ります/)).not.toBeInTheDocument();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("確認ダイアログで「削除を実行」するとexecuteActionsが呼ばれる", () => {
    const mockExecute = vi.fn();
    useAiStore.setState({
      suggestedActions: [deleteAction1],
      executeActions: mockExecute,
    });

    render(<AiOrganizer tabId="tab1" />);

    fireEvent.click(screen.getByText(/件を実行/));
    fireEvent.click(screen.getByText("削除を実行"));

    expect(mockExecute).toHaveBeenCalledWith([0]);
  });

  it("削除アクションのない実行は確認なしで即実行", () => {
    const mockExecute = vi.fn();
    useAiStore.setState({
      suggestedActions: [moveAction],
      executeActions: mockExecute,
    });

    render(<AiOrganizer tabId="tab1" />);

    fireEvent.click(screen.getByText(/件を実行/));

    expect(screen.queryByText(/ファイルをゴミ箱に送ります/)).not.toBeInTheDocument();
    expect(mockExecute).toHaveBeenCalledWith([0]);
  });

  it("削除アクション行に赤背景が適用される", () => {
    useAiStore.setState({
      suggestedActions: [deleteAction1],
    });

    const { container } = render(<AiOrganizer tabId="tab1" />);

    const actionRow = container.querySelector(".bg-red-50\\/50");
    expect(actionRow).toBeInTheDocument();
  });
});
