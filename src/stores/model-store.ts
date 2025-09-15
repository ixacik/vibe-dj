import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModelType = "gpt-5" | "gpt-5-mini";

interface ModelStore {
  selectedModel: ModelType;
  setSelectedModel: (model: ModelType) => void;
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      selectedModel: "gpt-5-mini",
      setSelectedModel: (model) => set({ selectedModel: model }),
    }),
    {
      name: "model-storage",
    }
  )
);