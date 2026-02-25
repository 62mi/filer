import { useSettingsStore } from "../stores/settingsStore";
import { en } from "./en";
import { ja } from "./ja";

export type { Translations } from "./ja";
export type Language = "ja" | "en";

const translations = { ja, en } as const;

/** React コンポーネント内で使用するフック */
export function useTranslation() {
  const language = useSettingsStore((s) => s.language);
  return translations[language];
}

/** ストアやユーティリティなどコンポーネント外で使用する関数 */
export function getTranslation() {
  const language = useSettingsStore.getState().language;
  return translations[language];
}
