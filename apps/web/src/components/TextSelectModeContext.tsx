import { createContext, useContext, type ReactNode } from "react";
import type { TextSelectMode } from "./HighlightableText";

const TextSelectModeContext = createContext<TextSelectMode>("highlight");

export function TextSelectModeProvider({
  mode,
  children,
}: {
  mode: TextSelectMode;
  children: ReactNode;
}) {
  return (
    <TextSelectModeContext.Provider value={mode}>
      {children}
    </TextSelectModeContext.Provider>
  );
}

export function useTextSelectMode(): TextSelectMode {
  return useContext(TextSelectModeContext);
}
