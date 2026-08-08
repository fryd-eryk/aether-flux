import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

import { StartCardCreatorPreview } from '@/game/cardCreatorMain';
import { EventBus } from '@/game/EventBus';
import type { CardDefinition } from '@/game/types/Card';
import styles from '@/styles/CardCreator.module.css';

const PREVIEW_CONTAINER_ID = 'card-creator-preview';
const DEBOUNCE_MS = 150;

export type PreviewMode = 'full' | 'simplified';

interface PreviewPaneProps {
    definition: CardDefinition;
    mode: PreviewMode;
    onModeChange: (mode: PreviewMode) => void;
    children?: ReactNode;
}

export function PreviewPane({ definition, mode, onModeChange, children }: PreviewPaneProps) {
    const gameRef = useRef<Phaser.Game | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Boots its own small Phaser.Game once, mirroring PhaserGame.tsx's pattern — but
    // with only the CardCreatorPreview scene, not Boot/Preloader/CardGame's board.
    useLayoutEffect(() => {
        if (gameRef.current === null) {
            gameRef.current = StartCardCreatorPreview(PREVIEW_CONTAINER_ID);
        }

        return () => {
            gameRef.current?.destroy(true);
            gameRef.current = null;
        };
    }, []);

    // Debounced so a fast-typed name field doesn't spam the scene's texture loader.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            EventBus.emit('card-creator:preview-update', { definition, mode });
        }, DEBOUNCE_MS);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [definition, mode]);

    return (
        <div className={styles.previewPane}>
            <div className={styles.previewToolbar}>
                <button
                    type="button"
                    className={`${styles.toggleButton} ${mode === 'full' ? styles.toggleButtonActive : ''}`}
                    onClick={() => onModeChange('full')}
                >
                    Full
                </button>
                <button
                    type="button"
                    className={`${styles.toggleButton} ${mode === 'simplified' ? styles.toggleButtonActive : ''}`}
                    onClick={() => onModeChange('simplified')}
                >
                    Simplified
                </button>
            </div>
            <div className={styles.previewCanvasWrap}>
                <div id={PREVIEW_CONTAINER_ID} />
            </div>
            {children}
        </div>
    );
}
