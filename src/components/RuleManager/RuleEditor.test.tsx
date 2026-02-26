import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ruleStore の完全モック
vi.mock("../../stores/ruleStore", () => ({
  useRuleStore: vi.fn(() => ({
    createRule: vi.fn(),
    updateRule: vi.fn(),
  })),
}));

import { RuleEditor } from "./RuleEditor";

afterEach(cleanup);

describe("RuleEditor — 削除警告", () => {
  it("actionTypeがdeleteの時、警告バナーが表示される", () => {
    render(
      <RuleEditor
        folderPath="C:\\test"
        rule={{
          id: "rule-1",
          folder_path: "C:\\test",
          name: "一時ファイル削除",
          enabled: true,
          priority: 0,
          action_type: "delete",
          action_dest: null,
          conditions: [{ id: "c1", rule_id: "rule-1", cond_type: "extension", cond_value: "tmp" }],
          auto_execute: false,
          created_at: Date.now(),
          updated_at: Date.now(),
        }}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("削除アクションはファイルをゴミ箱に送ります")).toBeInTheDocument();
  });

  it("actionTypeがmoveの時、削除警告は非表示", () => {
    render(
      <RuleEditor
        folderPath="C:\\test"
        rule={{
          id: "rule-1",
          folder_path: "C:\\test",
          name: "PDF移動",
          enabled: true,
          priority: 0,
          action_type: "move",
          action_dest: "C:\\test\\Documents",
          conditions: [{ id: "c1", rule_id: "rule-1", cond_type: "extension", cond_value: "pdf" }],
          auto_execute: false,
          created_at: Date.now(),
          updated_at: Date.now(),
        }}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("削除アクションはファイルをゴミ箱に送ります"),
    ).not.toBeInTheDocument();
  });

  it("delete + autoExecuteの時、追加警告が表示される", () => {
    render(
      <RuleEditor
        folderPath="C:\\test"
        rule={{
          id: "rule-1",
          folder_path: "C:\\test",
          name: "一時ファイル削除",
          enabled: true,
          priority: 0,
          action_type: "delete",
          action_dest: null,
          conditions: [{ id: "c1", rule_id: "rule-1", cond_type: "extension", cond_value: "tmp" }],
          auto_execute: true,
          created_at: Date.now(),
          updated_at: Date.now(),
        }}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("削除アクションはファイルをゴミ箱に送ります")).toBeInTheDocument();
    expect(
      screen.getByText("削除の自動実行はファイルが確認なしでゴミ箱に送られます"),
    ).toBeInTheDocument();
  });

  it("delete + autoExecute=falseの時、autoExecute警告は非表示", () => {
    render(
      <RuleEditor
        folderPath="C:\\test"
        rule={{
          id: "rule-1",
          folder_path: "C:\\test",
          name: "一時ファイル削除",
          enabled: true,
          priority: 0,
          action_type: "delete",
          action_dest: null,
          conditions: [{ id: "c1", rule_id: "rule-1", cond_type: "extension", cond_value: "tmp" }],
          auto_execute: false,
          created_at: Date.now(),
          updated_at: Date.now(),
        }}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("削除アクションはファイルをゴミ箱に送ります")).toBeInTheDocument();
    expect(
      screen.queryByText("削除の自動実行はファイルが確認なしでゴミ箱に送られます"),
    ).not.toBeInTheDocument();
  });

  it("アクションをdeleteに変更するとリアルタイムで警告表示", () => {
    render(<RuleEditor folderPath="C:\\test" rule={null} onBack={vi.fn()} />);

    // 初期状態（move）では警告なし
    expect(
      screen.queryByText("削除アクションはファイルをゴミ箱に送ります"),
    ).not.toBeInTheDocument();

    // アクションをdeleteに変更
    const select = screen.getByDisplayValue("移動");
    fireEvent.change(select, { target: { value: "delete" } });

    expect(screen.getByText("削除アクションはファイルをゴミ箱に送ります")).toBeInTheDocument();
  });

  it("deleteでautoExecuteをONにすると追加警告が表示される", () => {
    render(
      <RuleEditor
        folderPath="C:\\test"
        rule={{
          id: "rule-1",
          folder_path: "C:\\test",
          name: "一時ファイル削除",
          enabled: true,
          priority: 0,
          action_type: "delete",
          action_dest: null,
          conditions: [{ id: "c1", rule_id: "rule-1", cond_type: "extension", cond_value: "tmp" }],
          auto_execute: false,
          created_at: Date.now(),
          updated_at: Date.now(),
        }}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("削除の自動実行はファイルが確認なしでゴミ箱に送られます"),
    ).not.toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(
      screen.getByText("削除の自動実行はファイルが確認なしでゴミ箱に送られます"),
    ).toBeInTheDocument();
  });
});
