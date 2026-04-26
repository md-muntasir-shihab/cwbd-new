import { useEffect } from 'react';

/**
 * Calls `handler` when the Escape key is pressed.
 * Automatically cleans up the listener on unmount or when `enabled` becomes false.
 */
export function useEscapeKey(handler: () => void, enabled = true) {
    useEffect(() => {
        if (!enabled) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                handler();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handler, enabled]);
}
