import { create } from 'zustand';

interface RiskWizardState {
  isAnalyzing: boolean;
  setIsAnalyzing: (val: boolean) => void;
}

export const useRiskWizardStore = create<RiskWizardState>((set) => ({
  isAnalyzing: false,
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),
}));