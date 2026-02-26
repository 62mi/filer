export const ja = {
  // ── 共通 ──
  common: {
    close: "閉じる",
    cancel: "キャンセル",
    save: "保存",
    saving: "保存中...",
    saved: "保存済み",
    delete: "削除",
    back: "戻る",
    ok: "OK",
    loading: "読み込み中...",
    settings: "設定",
    edit: "編集",
    add: "追加",
    name: "名前",
    size: "サイズ",
    expand: "展開",
    collapse: "折りたたむ",
    configure: "設定",
    create: "作成",
    update: "更新",
    resetAll: "全てリセット",
    hideAll: "すべて非表示",
    move: "移動",
    copy: "コピー",
    browse: "参照...",
  },

  // ── コンテキストメニュー ──
  contextMenu: {
    open: "開く",
    copy: "コピー",
    cut: "切り取り",
    paste: "貼り付け",
    delete: "削除",
    rename: "名前の変更",
    addToStack: "スタックに追加",
    pasteFromStackMove: "スタックから移動",
    pasteFromStackCopy: "スタックからコピー",
    folderRules: "フォルダルール",
    aiRuleWizard: "AIルールウィザード",
    aiAutoOrganize: "AI自動整理",
    newFolder: "新しいフォルダー",
    newFile: "新しいファイル",
    createFromTemplate: "テンプレートから作成",
    templateManager: "テンプレート管理...",
    properties: "プロパティ",
  },

  // ── ツールバー ──
  toolbar: {
    view: "表示",
    details: "詳細",
    mediumIcons: "中アイコン",
    settingsTooltip: "設定 (Ctrl+,)",
  },

  // ── ステータスバー ──
  statusBar: {
    items: "項目",
    folders: "フォルダー",
    files: "ファイル",
    selected: "選択中",
    aiUsageTooltip: "AI使用量 (クリックで設定)",
    togglePreview: "プレビュー切替 (Alt+P)",
    tidiness: {
      score: "整理スコア",
      extTypes: "拡張子の種類",
      oldFiles: "古いファイル",
      fileCount: "ファイル数",
      nestDepth: "ネスト構造",
      depth: "深さ",
      types: "種類",
      count: "件",
    },
    copyInProgress: "件のコピー進行中",
  },

  // ── 列ヘッダー ──
  columnHeader: {
    name: "名前",
    modified: "更新日時",
    type: "種類",
    size: "サイズ",
  },

  // ── パネル ──
  panel: {
    searching: "検索中...",
    loading: "読み込み中...",
    noResults: "見つかりませんでした。",
    emptyFolder: "このフォルダーは空です。",
    fileOperationFailed: "ファイル操作に失敗しました",
    clipboardImageCreated: "クリップボードから画像ファイルを作成しました",
    clipboardTextCreated: "クリップボードからテキストファイルを作成しました",
    undoFailed: "元に戻す操作に失敗しました",
    redoFailed: "やり直し操作に失敗しました",
    templateDeployed: "テンプレートを展開しました",
    templateDeployFailed: "テンプレート展開に失敗",
  },

  // ── コピーキュー ──
  copyQueue: {
    title: "コピーキュー",
    clearCompleted: "完了済みをクリア",
    operationMove: "Move",
    operationCopy: "Copy",
    statusCalculating: "計算中...",
    statusPending: "待機中",
    statusPaused: "一時停止",
    statusCompleted: "完了",
    statusCancelled: "キャンセル",
    statusError: "エラー",
    resume: "再開",
    pause: "一時停止",
    cancel: "キャンセル",
    files: "files",
    copyInProgress: "件のコピー進行中",
  },

  // ── ホーム画面 ──
  homeView: {
    desktop: "デスクトップ",
    downloads: "ダウンロード",
    documents: "ドキュメント",
    pictures: "ピクチャ",
    music: "ミュージック",
    videos: "ビデオ",
    quickAccess: "クイック アクセス",
    recentItems: "最近使用した項目",
    favorites: "お気に入り",
    accessedDate: "アクセス日時",
    fileLocation: "ファイルの場所",
    path: "パス",
    noRecentItems: "最近使用した項目はありません",
    noFavorites: "お気に入りはありません",
  },

  // ── 設定ダイアログ ──
  settingsDialog: {
    title: "設定",
    simple: "簡易",
    advanced: "詳細",
    fontSize: "フォントサイズ",
    fileList: "ファイルリスト",
    gridLabel: "グリッドラベル",
    uiGeneral: "UI全般",
    gridIcon: "グリッドアイコン",
    ctrlWheelHint: "Ctrl+マウスホイールでも変更可",
    icons: "アイコン",
    barHeights: "バーの高さ",
    tabBar: "タブバー",
    bookmarkBar: "ブックマークバー",
    bookmarkItem: "ブックマーク項目",
    toolbar: "ツールバー",
    columnHeader: "列ヘッダー",
    detailRow: "詳細行",
    statusBar: "ステータスバー",
    gridGap: "グリッド間隔",
    grid: "グリッド",
    language: "言語",
    languageJa: "日本語",
    languageEn: "English",
    general: "一般",
  },

  // ── AI自動整理 ──
  aiOrganizer: {
    title: "AI自動整理",
    scanFiles: "ファイルをスキャン",
    aiCreatingPlan: "AIが整理プランを作成",
    planComplete: "プラン完成",
    assignFiles: "ファイルを振り分け",
    assignComplete: "振り分け完了",
    seconds: "秒",
    minutes: "分",
    presetAuto: "おまかせ整理",
    presetAutoDesc: "AIがフォルダの中身を見て最適な整理を提案",
    presetByType: "種類別に整理",
    presetByTypeDesc: "画像・文書・動画などサブフォルダへ",
    presetByTypeInstruction:
      "ファイルを拡張子の種類ごとにサブフォルダに整理して。画像はImages、ドキュメントはDocuments、動画はVideos、音楽はMusic、その他はOthersのようにわかりやすくまとめて。",
    presetOld: "古いファイル整理",
    presetOldDesc: "3ヶ月以上前のファイルをOldへ",
    presetOldInstruction: "3ヶ月以上前のファイルをOldフォルダに移動して。フォルダは対象外にして。",
    presetDuplicates: "重複ファイル整理",
    presetDuplicatesDesc: "コピー(1)等の重複ファイルをまとめる",
    presetDuplicatesInstruction:
      "ファイル名に (1)、(2)、コピー、Copy などが含まれるコピーと思われるファイルを探して、Duplicatesフォルダに移動して。",
    presetClutter: "散らかり一掃",
    presetClutterDesc: "一時ファイル・インストーラーを整理",
    presetClutterInstruction:
      "ダウンロードしたまま放置されていそうなファイル（.exe, .msi, .zip, .tmp, .log）をCleanupフォルダに移動して整理して。",
    presetUnwanted: "不要ファイル一掃",
    presetUnwantedDesc: ".tmp, Thumbs.db等の不要ファイルを削除提案",
    presetUnwantedInstruction:
      "フォルダ内の不要ファイルを見つけてdeleteアクションで削除候補にしてください。対象: 一時ファイル(.tmp .log .bak .old)、OSゴミ(Thumbs.db desktop.ini .DS_Store)、重複コピー((1) (2) - Copy)。本当に不要なものだけを対象にし、重要そうなファイルは含めないでください。",
    writeCustom: "自分で指示を書く →",
    customInputLabel: "自由に指示を入力",
    backToPresets: "← プリセットに戻る",
    customPlaceholder:
      "好きなように指示してください:\n「PDFだけDocumentsに移動して」\n「この中の画像をまとめたい」",
    ctrlEnterToGenerate: "Ctrl+Enter で生成",
    apiKeyNotSet: "APIキーが未設定です。「設定」からClaude APIキーを入力してください。",
    creating: "作成中...",
    createPlan: "プラン作成",
    organizationPlan: "整理プラン",
    noOrganizationNeeded: "整理の必要がないようです",
    items: "件",
    tokens: "トークン",
    assigning: "振り分け中...",
    organizeWithPlan: "この計画で整理",
    noMatchingFiles: "該当するファイルが見つかりませんでした",
    backToPlan: "プランに戻る",
    actionSuggestions: "件のアクション提案",
    deselectAll: "すべて解除",
    selectAll: "すべて選択",
    executing: "実行中...",
    executeCount: "件を実行",
    actionMove: "移動",
    actionCopy: "コピー",
    actionDelete: "削除",
    exclude: "除外",
    succeeded: "件 成功",
    failed: "件 失敗",
    tryDifferent: "別の指示を試す",
    done: "完了",
  },

  // ── AI設定 ──
  aiSettings: {
    title: "AI設定",
    apiKeyConfigured: "APIキー設定済み",
    apiKeyNotConfigured: "APIキーが未設定です",
    apiKeyPlaceholderSet: "••••••••（設定済み）",
    apiKeyDescription:
      "APIキーは Anthropic Console (console.anthropic.com) で取得できます。キーはローカルに保存され、外部には送信されません。",
    monthlyBudget: "月間予算",
    budgetPlaceholder: "例: 5.00",
    currentUsage: "今月の使用量",
    input: "入力",
    output: "出力",
    apiKeySaved: "APIキーを保存しました",
    deleteKey: "キー削除",
    enterApiKey: "APIキーを入力してください",
    apiKeyMustStartWithSk: "APIキーは sk- で始まる必要があります",
    enterValidAmount: "有効な金額を入力してください",
  },

  // ── ルールウィザード ──
  ruleWizard: {
    title: "AI ルールウィザード",
    welcomeMessage: "どんなルールを作りたいですか？",
    example1: "PDFファイルをDocumentsフォルダに移動して",
    example2: "スクリーンショットを自動で画像フォルダに整理",
    example3: "1ヶ月以上前のtmpファイルを削除",
    aiThinking: "AIが考え中...",
    createRule: "ルールを作成",
    orContinueAdjusting: "または下の入力欄で調整を続けられます",
    inputPlaceholder: "ルールの内容を自由に説明してください...",
    rulePreview: "ルールプレビュー",
    action: "アクション",
    mode: "モード",
    autoExecute: "自動実行",
    suggestMode: "サジェスト（確認後に実行）",
    matchingFiles: "マッチするファイル",
    noMatchingFiles: "現在のフォルダにマッチするファイルはありません",
  },

  // ── ルールサジェストバナー ──
  ruleSuggestion: {
    ruleMatch: "ルールマッチ",
    suggestions: "件のサジェスト",
    alwaysExecute: "常に実行",
    moreSuggestions: "件のサジェスト",
  },

  // ── パターンサジェストバナー ──
  patternSuggestion: {
    title: "ルール提案 — よく行う操作が見つかりました",
    hide: "非表示",
    frequentlyMovingPre: "よく ",
    frequentlyMovingMid: " ファイルを ",
    frequentlyMovingPost: " に移動しています",
    moveHistory: "回の移動履歴",
    createRule: "ルール作成",
  },

  // ── ルール管理 ──
  ruleManager: {
    title: "フォルダルール",
    noRules: "ルールがありません",
    noRulesHint: "「新規ルール」をクリックして自動整理ルールを作成",
    confirmDelete: "削除確認",
    disable: "無効にする",
    enable: "有効にする",
    newRule: "新規ルール",
    createWithAi: "AIで作成",
    noConditions: "条件なし",
    contains: "含む",
    daysOrMore: "日以上",
  },

  // ── ルールエディタ ──
  ruleEditor: {
    editRule: "ルール編集",
    newRule: "新規ルール",
    ruleName: "ルール名",
    ruleNamePlaceholder: "例: PDFをDocumentsへ移動",
    conditionsLabel: "条件（すべて満たすファイルに適用）",
    action: "アクション",
    moveDestination: "移動先",
    copyDestination: "コピー先",
    folder: "フォルダ",
    autoExecute: "自動実行",
    autoExecuteDescription:
      "ONにすると確認なしで自動的に実行します。OFFの場合はサジェストとして表示されます。",
    selectDestFolder: "移動先フォルダを選択",
    errorRuleName: "ルール名を入力してください",
    errorConditions: "条件を1つ以上追加してください",
    errorConditionValue: "の値を入力してください",
    errorDestFolder: "移動先/コピー先フォルダを指定してください",
  },

  // ── テンプレート管理 ──
  templateManager: {
    title: "テンプレート管理",
    deployToFolder: "現在のフォルダに展開",
    newTemplate: "新しいテンプレート",
    templateName: "テンプレート名",
    structure: "構造",
    addChild: "子要素を追加",
    folderOption: "Folder",
    fileOption: "File",
    namePlaceholder: "名前",
  },

  // ── プロパティ ──
  properties: {
    title: "プロパティ",
    loadingProperties: "プロパティを読み込み中...",
    failedToLoad: "プロパティの読み込みに失敗しました",
    type: "種類",
    fileFolder: "ファイルフォルダー",
    location: "場所",
    size: "サイズ",
    created: "作成日時",
    modified: "更新日時",
    accessed: "アクセス日時",
    files: "ファイル",
    folders: "フォルダー",
    attributes: "属性",
    readOnly: "読み取り専用",
    hidden: "隠しファイル",
    system: "システム",
  },

  // ── コマンドパレット ──
  commandPalette: {
    placeholder: "ファイル検索... (> でコマンド)",
    noResults: "結果が見つかりません",
    hintSelect: "選択",
    hintExecute: "実行",
    hintClose: "閉じる",
    hintCommand: "コマンド",
  },

  // ── ルールラベル ──
  ruleLabels: {
    conditions: {
      extension: "拡張子",
      name_glob: "名前パターン (glob)",
      name_contains: "名前に含む",
      size_min: "最小サイズ (bytes)",
      size_max: "最大サイズ (bytes)",
      age_days: "経過日数",
    } as Record<string, string>,
    actions: {
      move: "移動",
      copy: "コピー",
      delete: "ゴミ箱へ",
    } as Record<string, string>,
  },

  // ── ルール実行通知 ──
  ruleExecution: {
    executed: "{rule}: {file} を{action}しました",
    actionMove: "移動",
    actionCopy: "コピー",
    actionDelete: "削除",
    watcherUpdateFailed: "ウォッチャー更新失敗",
  },

  // ── ナビゲーションバー ──
  navigationBar: {
    terminalFailed: "ターミナルの起動に失敗しました",
  },

  // ── サイドバー ──
  sidebar: {
    quickAccess: "クイック アクセス",
    thisPC: "PC",
    stack: "スタック",
    clearStack: "スタッククリア",
    dragFilesHere: "ここにファイルをドラッグ",
    remove: "削除",
    clearAll: "すべてクリア",
  },

  // ── フォーマット ──
  format: {
    bytes: "バイト",
  },
} as const;

/** リテラル型をstring型に緩和する再帰ヘルパー */
type DeepStringify<T> = T extends string
  ? string
  : T extends Record<string, unknown>
    ? { [K in keyof T]: DeepStringify<T[K]> }
    : T;

export type Translations = DeepStringify<typeof ja>;
