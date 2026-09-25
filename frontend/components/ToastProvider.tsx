"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence } from "framer-motion";
import Toast from "@/components/Toast";
import { playAction, type ActionSound } from "@/lib/sound";

type ToastType = "success" | "error";
type ToastOptions = { onAction?: () => void; sound?: ActionSound | false };
type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
  onAction?: () => void;
};

type ToastCtx = {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

/* App-wide, site-styled toast notifications. Use `const { toast } = useToast()`
   then `toast("Saved", "success")`. Replaces browser alert()/confirm() popups
   for feedback. Toasts stack bottom-right and auto-dismiss. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "success", options?: ToastOptions) => {
      const id = Date.now() + Math.random();
      const actionSound = options?.sound === undefined
        ? (type === "error" ? "error" : "confirm")
        : options.sound;
      if (actionSound) void playAction(actionSound);
      setItems((list) => [
        ...list,
        { id, message, type, onAction: options?.onAction },
      ]);
    },
    []
  );

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-0 right-0 z-[90] flex flex-col items-end gap-2 p-4">
        <AnimatePresence>
          {items.map((it, i) => (
            <div
              key={it.id}
              className="pointer-events-auto"
              style={{ marginBottom: i === items.length - 1 ? 0 : 0 }}
            >
              <Toast
                message={it.message}
                type={it.type}
                onAction={it.onAction}
                onClose={() => remove(it.id)}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  // Fallback no-op keeps components usable outside the provider (e.g. tests).
  return ctx ?? { toast: () => {} };
}
