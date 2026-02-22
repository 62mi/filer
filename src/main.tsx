import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Tauri webviewのデフォルト右クリックメニューを無効化
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
