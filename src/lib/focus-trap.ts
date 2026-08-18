/**
 * Where Tab should land next inside a dialog.
 *
 * Kept separate from the component so the wrap-around cases are testable without
 * a DOM.
 *
 * @param current index of the focused element within the dialog, -1 if focus
 *                escaped the dialog entirely
 * @param count   number of focusable elements in the dialog
 * @returns the index to focus, or -1 when the dialog has nothing focusable
 */
export function nextFocusIndex(current: number, count: number, shiftKey: boolean): number {
    if (count <= 0) return -1;

    // Focus escaped the dialog: pull it back to the near edge.
    if (current < 0) return shiftKey ? count - 1 : 0;

    return shiftKey ? (current - 1 + count) % count : (current + 1) % count;
}

/** Selector for the things a keyboard user can reach. */
export const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');
