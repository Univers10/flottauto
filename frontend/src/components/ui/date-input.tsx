"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DateInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function DateInput({ className, value, onValueChange, ...props }: DateInputProps) {
  return (
    <div className="relative">
      <input
        type="date"
        data-slot="date-input"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 dark:bg-input/20 tabular",
          value ? "pr-10" : "pr-3",
          className
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          aria-label="Effacer la date"
          onClick={() => onValueChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
