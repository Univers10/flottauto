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
          "h-11 w-full min-w-0 rounded-xl border border-border/60 bg-muted/50 px-3.5 py-2 text-base transition-colors outline-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30",
          value ? "pr-10" : "pr-3.5",
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
