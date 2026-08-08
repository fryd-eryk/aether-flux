import { useCallback, useState } from 'react';

// The File System Access API's TS lib types aren't in this project's `lib` config
// (see tsconfig.json — no "dom" additions beyond the default), so the handful of
// types used here are declared locally rather than pulling in a new @types package
// for a browser API that's only exercised behind a feature-detect guard.
interface FileSystemWritableFileStream {
    write(data: string): Promise<void>;
    close(): Promise<void>;
}
interface FileSystemFileHandleLike {
    name: string;
    createWritable(): Promise<FileSystemWritableFileStream>;
}
interface ShowOpenFilePickerWindow {
    showOpenFilePicker(options: {
        types: { description: string; accept: Record<string, string[]> }[];
        excludeAcceptAllOption?: boolean;
    }): Promise<FileSystemFileHandleLike[]>;
}

function isSupported(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

/**
 * Wraps the browser File System Access API for the Card Creator's save flow — no
 * backend, per the plan (next.config.mjs's `output: 'export'` forbids Next.js API
 * routes). `showOpenFilePicker` (not `showSaveFilePicker`) is the only viable
 * one-time-permission flow, since there's no way to pre-seed a save picker with a
 * specific existing relative path — the user picks `src/game/data/cards.ts` once per
 * session and every Save overwrites it wholesale.
 */
export function useCardsFile() {
    const supported = isSupported();
    const [handle, setHandle] = useState<FileSystemFileHandleLike | null>(null);
    const [error, setError] = useState<string | null>(null);

    const connect = useCallback(async () => {
        if (!supported) return;
        setError(null);
        try {
            const [picked] = await (window as unknown as ShowOpenFilePickerWindow).showOpenFilePicker({
                types: [{ description: 'TypeScript', accept: { 'text/typescript': ['.ts'] } }],
                excludeAcceptAllOption: false,
            });
            setHandle(picked);
        } catch (e) {
            // Thrown on user cancel too (AbortError) — not a real error, ignore silently.
            if (e instanceof DOMException && e.name === 'AbortError') return;
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [supported]);

    const save = useCallback(
        async (source: string) => {
            if (!handle) throw new Error('No file connected.');
            const writable = await handle.createWritable();
            await writable.write(source);
            await writable.close();
        },
        [handle],
    );

    return { supported, handle, fileName: handle?.name ?? null, error, connect, save };
}
