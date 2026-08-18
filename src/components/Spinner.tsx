/**
 * Loading indicator.
 *
 * The same six lines of markup were copied into six files. One component keeps the
 * rotation, size and colour in step, and gives the indicator an accessible name —
 * previously a spinning div announced nothing at all.
 */
export function Spinner({ label = 'Loading', className = '' }: { label?: string; className?: string }) {
    return (
        <span role="status" className={`inline-flex items-center justify-center ${className}`}>
            <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            <span className="sr-only">{label}</span>
        </span>
    );
}

/** Spinner centred in the space its content will occupy. */
export function SpinnerBlock({ label, className = 'h-64' }: { label?: string; className?: string }) {
    return (
        <div className={`flex items-center justify-center ${className}`}>
            <Spinner label={label} />
        </div>
    );
}
