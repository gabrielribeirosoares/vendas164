import React from "react";

export interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onClearFilter?: () => void;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClearFilter,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-card p-2 rounded-xl border border-border/50 text-xs">
      <div className="flex items-center gap-1.5">
        <label className="text-muted-foreground font-medium">De:</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="bg-background border border-input rounded-md px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <label className="text-muted-foreground font-medium">Até:</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="bg-background border border-input rounded-md px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {(startDate || endDate) && onClearFilter && (
        <button
          type="button"
          onClick={onClearFilter}
          className="px-2 py-1 bg-muted text-muted-foreground hover:text-foreground rounded-md text-xs font-medium transition-colors"
        >
          Limpar
        </button>
      )}
    </div>
  );
};
