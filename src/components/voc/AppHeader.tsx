import { useRef } from "react";
import type { Dataset } from "@/lib/voc/types";

type Props = {
  datasets: Dataset[];
  activeId: string;
  onSelect: (id: string) => void;
  onUpload: (file: File) => void;
  error: string | null;
  evaluationOpen: boolean;
  onToggleEvaluation: () => void;
};

export function AppHeader({
  datasets,
  activeId,
  onSelect,
  onUpload,
  error,
  evaluationOpen,
  onToggleEvaluation,
}: Props) {

  const inputRef = useRef<HTMLInputElement>(null);
  const active = datasets.find((d) => d.id === activeId);

  return (
    <header className="frost-surface spec relative z-10 flex items-center justify-between rounded-2xl py-3 pr-4 pl-5">
      <div className="flex items-center gap-3">
        <div
          className="grid size-9 place-items-center rounded-xl font-display text-sm font-bold text-primary-foreground"
          style={{ background: "var(--gradient-mark)" }}
        >
          V
        </div>
        <div>
          <h1 className="text-[15px] leading-tight font-semibold">Voice of Customer Copilot</h1>
          <div className="text-[10.5px] text-ink-soft">Evidence-backed product insight</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {error ? <span className="text-[11px] font-medium text-danger">{error}</span> : null}
        <div className="frost-inset flex items-center gap-2 rounded-lg px-3 py-1.5">
          <select
            value={activeId}
            onChange={(e) => onSelect(e.target.value)}
            aria-label="Active dataset"
            className="bg-transparent text-[11px] font-medium text-ink outline-none"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span
            className={`size-1.5 rounded-full ${active?.status === "loaded" ? "bg-accent" : "bg-ink-soft/50"}`}
            title={active?.status === "loaded" ? "Data connected" : "No data connected"}
          />
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="btn-brand spec cursor-pointer rounded-lg px-3.5 py-1.5 text-[12px] font-semibold"
        >
          + Add Dataset
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </div>
    </header>
  );
}
