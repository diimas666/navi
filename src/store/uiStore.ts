import {create} from 'zustand';

type UiState = {
  toast: string | null;
  showToast: (toast: string) => void;
  clearToast: () => void;
};

export const useUiStore = create<UiState>(set => ({
  toast: null,
  showToast: toast => set({toast}),
  clearToast: () => set({toast: null}),
}));
