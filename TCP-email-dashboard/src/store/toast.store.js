import { create } from "zustand";

export const useToastStore = create((set) => ({
  toasts: [],
  addToast: (message, type = "success") => {
    const id = Date.now();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
  },
}));
