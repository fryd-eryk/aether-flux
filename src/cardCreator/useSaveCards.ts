import { useCallback, useState } from 'react';

/**
 * Posts the already-serialized cards.ts source to the dev-only API route
 * (src/pages/api/card-creator/save.ts), which overwrites the file on disk. Replaced
 * the earlier File System Access approach — that worked but was Chrome/Edge-only and
 * needed a one-time native file-picker permission per session; this needs neither,
 * at the cost of only working while `npm run dev` is running (already the only way
 * this tool gets used).
 */
export function useSaveCards() {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = useCallback(async (source: string) => {
        setSaving(true);
        setError(null);
        try {
            const response = await fetch('/api/card-creator/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.error ?? `Save failed (${response.status}).`);
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setError(message);
            throw e;
        } finally {
            setSaving(false);
        }
    }, []);

    return { save, saving, error };
}
