import { useEffect, useMemo, useRef, useState } from "react";

import styles from "@/styles/CardCreator.module.css";

export interface FilterListboxOption {
    value: string;
    label: string;
    /** Optional CSS color for a small swatch dot next to the option (e.g. rarity color). */
    swatch?: string;
}

interface FilterListboxProps {
    label: string;
    options: FilterListboxOption[];
    selected: string[];
    onChange: (next: string[]) => void;
}

/** Compact multi-select combobox: click to open a searchable, checkbox-per-option popover. Used for the Card Creator's categorical filters (type/tribes/keywords/rarity) in place of always-expanded checkbox groups. */
export function FilterListbox({ label, options, selected, onChange }: FilterListboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        function handlePointerDown(e: MouseEvent) {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open]);

    useEffect(() => {
        if (!open) setQuery("");
    }, [open]);

    const filteredOptions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) => o.label.toLowerCase().includes(q));
    }, [options, query]);

    function toggle(value: string, checked: boolean) {
        onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
    }

    const summary = selected.length === 0 ? `All ${label}` : `${label} (${selected.length})`;

    return (
        <div className={styles.filterListbox} ref={rootRef}>
            <button
                type="button"
                className={`${styles.filterListboxTrigger} ${selected.length > 0 ? styles.filterListboxTriggerActive : ""}`}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="listbox"
                title={summary}
            >
                <span className={styles.filterListboxTriggerLabel}>{summary}</span>
                <span className={styles.filterListboxCaret}>{open ? "▲" : "▼"}</span>
            </button>
            {open && (
                <div className={styles.filterListboxPopover} role="listbox">
                    <input
                        className={styles.filterListboxSearch}
                        placeholder={`Search ${label.toLowerCase()}...`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    <div className={styles.filterListboxOptions}>
                        {filteredOptions.length === 0 && <div className={styles.filterListboxEmpty}>No matches</div>}
                        {filteredOptions.map((option) => (
                            <label key={option.value} className={styles.filterListboxOption}>
                                <input type="checkbox" checked={selected.includes(option.value)} onChange={(e) => toggle(option.value, e.target.checked)} />
                                {option.swatch && <span className={styles.filterListboxSwatch} style={{ backgroundColor: option.swatch }} />}
                                {option.label}
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
