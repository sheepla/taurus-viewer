import { beforeEach, describe, expect, it } from "vitest";
import { useUiModeStore } from "./uiModeStore";

describe("useUiModeStore", () => {
  beforeEach(() => {
    useUiModeStore.setState({ currentMode: "NORMAL" });
  });

  it("starts in NORMAL mode", () => {
    expect(useUiModeStore.getState().currentMode).toBe("NORMAL");
  });

  it("switches to SEARCH mode", () => {
    useUiModeStore.getState().setMode("SEARCH");
    expect(useUiModeStore.getState().currentMode).toBe("SEARCH");
  });

  it("switches between sidebar modes and back to NORMAL", () => {
    useUiModeStore.getState().setMode("TREE");
    expect(useUiModeStore.getState().currentMode).toBe("TREE");

    useUiModeStore.getState().setMode("BOOKMARKS");
    expect(useUiModeStore.getState().currentMode).toBe("BOOKMARKS");

    useUiModeStore.getState().setMode("NORMAL");
    expect(useUiModeStore.getState().currentMode).toBe("NORMAL");
  });

  it("switches to VISUAL mode", () => {
    useUiModeStore.getState().setMode("VISUAL");
    expect(useUiModeStore.getState().currentMode).toBe("VISUAL");
  });
});
