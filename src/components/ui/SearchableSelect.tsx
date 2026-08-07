"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SearchableSelectOption = {
  value: string;
  label: string;
  searchText?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  options: readonly SearchableSelectOption[];
  value?: string | null;
  onChange: (
    value: string | null,
    option?: SearchableSelectOption | null,
  ) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  maxVisibleOptions?: number;
  emptyMessage?: string;
  className?: string;
  triggerClassName?: string;
  name?: string;
  id?: string;
  ariaLabel?: string;
};

const DEFAULT_MAX_VISIBLE_OPTIONS = 50;

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function getOptionSearchSource(option: SearchableSelectOption) {
  return normalizeSearchText(`${option.label} ${option.searchText ?? ""}`);
}

function getNextEnabledIndex(
  options: readonly SearchableSelectOption[],
  currentIndex: number,
  direction: 1 | -1,
) {
  if (options.length === 0) return -1;

  for (let offset = 1; offset <= options.length; offset += 1) {
    const index =
      (currentIndex + direction * offset + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }

  return -1;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "選択してください",
  searchPlaceholder = "検索...",
  disabled = false,
  clearable = true,
  maxVisibleOptions = DEFAULT_MAX_VISIBLE_OPTIONS,
  emptyMessage = "該当する候補がありません",
  className,
  triggerClassName,
  name,
  id,
  ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const deferredSearchValue = React.useDeferredValue(searchValue);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [isComposing, setIsComposing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const generatedId = React.useId();
  const listboxId = `${generatedId}-listbox`;
  const activeOptionId = activeIndex >= 0 ? `${generatedId}-option-${activeIndex}` : undefined;
  const selectedValue = value ?? "";

  const normalizedOptions = React.useMemo(
    () =>
      options.map((option) => ({
        option,
        searchSource: getOptionSearchSource(option),
      })),
    [options],
  );

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === selectedValue) ?? null,
    [options, selectedValue],
  );

  const { visibleOptions, matchCount } = React.useMemo(() => {
    const query = normalizeSearchText(deferredSearchValue);
    const limit = Math.max(1, maxVisibleOptions);
    const matches: SearchableSelectOption[] = [];
    let total = 0;

    for (const item of normalizedOptions) {
      if (!query || item.searchSource.includes(query)) {
        total += 1;
        if (matches.length < limit) {
          matches.push(item.option);
        }
      }
    }

    return { visibleOptions: matches, matchCount: total };
  }, [deferredSearchValue, maxVisibleOptions, normalizedOptions]);

  React.useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, visibleOptions.length);
    setActiveIndex((current) => {
      if (visibleOptions.length === 0) return -1;
      if (current >= 0 && current < visibleOptions.length && !visibleOptions[current]?.disabled) {
        return current;
      }

      const selectedIndex = visibleOptions.findIndex(
        (option) => option.value === selectedValue && !option.disabled,
      );
      if (selectedIndex >= 0) return selectedIndex;

      return visibleOptions.findIndex((option) => !option.disabled);
    });
  }, [selectedValue, visibleOptions]);

  React.useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (disabled) return;
      setOpen(nextOpen);

      if (nextOpen) {
        setSearchValue("");
        window.requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        setActiveIndex(-1);
        setIsComposing(false);
      }
    },
    [disabled],
  );

  const commitOption = React.useCallback(
    (option: SearchableSelectOption) => {
      if (option.disabled) return;
      onChange(option.value, option);
      handleOpenChange(false);
    },
    [handleOpenChange, onChange],
  );

  const clearSelection = React.useCallback(() => {
    if (disabled) return;
    onChange(null, null);
    setSearchValue("");
    handleOpenChange(false);
  }, [disabled, handleOpenChange, onChange]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const composing =
      isComposing ||
      event.nativeEvent.isComposing ||
      event.key === "Process";

    if (event.key === "Escape") {
      event.preventDefault();
      handleOpenChange(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => getNextEnabledIndex(visibleOptions, current, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        getNextEnabledIndex(
          visibleOptions,
          current < 0 ? visibleOptions.length : current,
          -1,
        ),
      );
      return;
    }

    if (event.key === "Enter" && !composing) {
      const option = visibleOptions[activeIndex];
      if (!option) return;
      event.preventDefault();
      commitOption(option);
    }
  };

  return (
    <div className={cn("relative w-full", className)}>
      {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-controls={listboxId}
            aria-haspopup="listbox"
            disabled={disabled}
            className={cn(
              "flex min-h-9 w-full items-center justify-between gap-2 rounded border border-input bg-white px-3 py-2 text-left text-sm shadow-sm outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70",
              selectedOption || selectedValue ? "text-slate-900" : "text-slate-500",
              clearable && selectedValue ? "pr-16" : "pr-9",
              triggerClassName,
            )}
          >
            <span className="block min-w-0 flex-1 truncate">
              {(selectedOption?.label ?? selectedValue) || placeholder}
            </span>
            <ChevronsUpDown className="absolute right-3 h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] max-w-[calc(100vw-2rem)] p-0"
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                onKeyDown={handleInputKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                placeholder={searchPlaceholder}
                role="searchbox"
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
                className="h-9 w-full rounded border border-input bg-white pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div
            id={listboxId}
            role="listbox"
            className="max-h-72 overflow-y-auto py-1"
          >
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-slate-500">
                {emptyMessage}
              </div>
            ) : (
              visibleOptions.map((option, index) => {
                const selected = option.value === selectedValue;
                const active = index === activeIndex;

                return (
                  <button
                    key={option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    id={`${generatedId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={option.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commitOption(option)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-sm outline-none",
                      active ? "bg-slate-100" : "bg-white",
                      selected ? "font-medium text-slate-950" : "text-slate-700",
                      option.disabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:bg-slate-100",
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-blue-600",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1 whitespace-normal break-words">
                      {option.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {matchCount > visibleOptions.length ? (
            <div className="border-t px-3 py-2 text-xs text-slate-500">
              {matchCount}件中{visibleOptions.length}件を表示中。さらに入力して絞り込んでください。
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {clearable && selectedValue && !disabled ? (
        <button
          type="button"
          aria-label="選択をクリア"
          title="選択をクリア"
          onClick={(event) => {
            event.stopPropagation();
            clearSelection();
          }}
          className="absolute right-9 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
