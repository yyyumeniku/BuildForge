import { Minus, Square, X } from "lucide-react";

export function Titlebar() {
  return (
    <div 
      className="h-8 bg-slate-950 flex items-center justify-between px-3 select-none"
      data-tauri-drag-region
    >
      <div className="text-xs text-slate-500">BuildForge</div>
      <div className="flex items-center gap-1">
        <button 
          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:bg-slate-800 rounded transition-colors"
          onClick={() => {}}
        >
          <Minus className="w-3 h-3" />
        </button>
        <button 
          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:bg-slate-800 rounded transition-colors"
          onClick={() => {}}
        >
          <Square className="w-3 h-3" />
        </button>
        <button 
          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:bg-red-600 rounded transition-colors"
          onClick={() => {}}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
