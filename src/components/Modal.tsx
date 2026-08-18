'use client';

import { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
import { nextFocusIndex, FOCUSABLE_SELECTOR } from '@/lib/focus-trap';

interface ModalProps {
    /** Accessible name of the dialog, rendered as its heading. */
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    /** Sticky footer, typically the confirm/cancel pair. */
    footer?: React.ReactNode;
    /** Tailwind max-width for the panel. */
    size?: 'md' | 'lg' | 'xl';
}

const SIZES = {
    md: 'md:max-w-md',
    lg: 'md:max-w-lg',
    xl: 'md:max-w-4xl',
} as const;

/**
 * Dialog with the keyboard behaviour browsers do not give a plain div: Escape
 * closes, Tab cycles inside, focus enters on open and returns to the trigger on
 * close, and the page behind does not scroll.
 *
 * Bottom sheet on phones, centred panel from md up — the pattern the queue screen
 * already used, now in one place instead of three copies.
 */
export function Modal({ title, onClose, children, footer, size = 'md' }: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const titleId = useId();

    useEffect(() => {
        returnFocusRef.current = document.activeElement as HTMLElement | null;

        const panel = panelRef.current;
        const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

        focusable()[0]?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;

            const elements = focusable();
            const target = nextFocusIndex(
                elements.indexOf(document.activeElement as HTMLElement),
                elements.length,
                event.shiftKey
            );
            if (target < 0) return;

            event.preventDefault();
            elements[target].focus();
        };

        document.addEventListener('keydown', onKeyDown);

        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = overflow;
            returnFocusRef.current?.focus();
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50"
            onClick={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`bg-slate-800 rounded-t-2xl md:rounded-xl border border-slate-700 w-full ${SIZES[size]} max-h-[90vh] flex flex-col animate-slide-up md:animate-none safe-bottom`}
            >
                <div className="flex items-center justify-between gap-4 p-4 border-b border-slate-700">
                    <h2 id={titleId} className="text-lg font-semibold text-white">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="touch-target flex items-center justify-center -mr-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">{children}</div>

                {footer && (
                    <div className="flex justify-end gap-3 p-4 border-t border-slate-700">{footer}</div>
                )}
            </div>
        </div>
    );
}
