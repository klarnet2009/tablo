'use client';

import { useId } from 'react';

/** Shared control styling, so the long class string is not copied per input. */
export const controlClass =
    'w-full px-3 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white ' +
    'placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';

interface FieldProps {
    label: string;
    required?: boolean;
    /** Rendered under the control and wired up via aria-describedby. */
    hint?: string;
    /** Receives the generated ids to spread onto the control. */
    children: (props: { id: string; 'aria-describedby'?: string }) => React.ReactNode;
}

/**
 * Label + control with the association actually made.
 *
 * Every form in this app rendered a <label> as a *sibling* of its input with no
 * htmlFor and no id, so no control had an accessible name and clicking a label
 * did nothing. Generating the id here makes that impossible to forget, and works
 * for components rendered more than once on a page.
 */
export function Field({ label, required, hint, children }: FieldProps) {
    const id = useId();
    const hintId = `${id}-hint`;

    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1.5">
                {label}
                {required && (
                    <>
                        {' '}
                        <span className="text-red-400" aria-hidden="true">
                            *
                        </span>
                        <span className="sr-only">(required)</span>
                    </>
                )}
            </label>
            {children(hint ? { id, 'aria-describedby': hintId } : { id })}
            {hint && (
                <p id={hintId} className="text-xs text-slate-400 mt-1">
                    {hint}
                </p>
            )}
        </div>
    );
}
