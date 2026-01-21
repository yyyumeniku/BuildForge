import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, X } from "lucide-react";

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}

let toastListeners: ((toast: Toast) => void)[] = [];

export function toast(options: Omit<Toast, "id">) {
  const id = Math.random().toString(36).slice(2);
  const toast = { ...options, id };
  toastListeners.forEach((listener) => listener(toast));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    };
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getIcon = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-400" />;
      case "info":
        return <AlertCircle className="w-5 h-5 text-blue-400" />;
    }
  };

  const getBorderColor = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return "border-green-500/30";
      case "error":
        return "border-red-500/30";
      case "info":
        return "border-blue-500/30";
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`bg-slate-800 rounded-lg border ${getBorderColor(toast.type)} p-4 shadow-lg max-w-sm animate-in slide-in-from-right-5 fade-in duration-300`}
        >
          <div className="flex items-start gap-3">
            {getIcon(toast.type)}
            <div className="flex-1">
              <p className="font-medium text-white">{toast.title}</p>
              {toast.message && (
                <p className="text-sm text-slate-400 mt-1">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
