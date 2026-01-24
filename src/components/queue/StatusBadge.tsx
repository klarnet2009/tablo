import { statusInfo, priorityInfo, VisitStatus } from '@/lib/status-machine';

interface StatusBadgeProps {
    status: string;
    size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
    const info = statusInfo[status as VisitStatus] || {
        label: status,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100'
    };

    const sizeClasses = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
    };

    return (
        <span className={`inline-flex items-center font-medium rounded-full ${sizeClasses[size]} ${info.bgColor} ${info.color}`}>
            {info.label}
        </span>
    );
}

interface PriorityBadgeProps {
    priority: string;
    size?: 'sm' | 'md' | 'lg';
}

export function PriorityBadge({ priority, size = 'md' }: PriorityBadgeProps) {
    const info = priorityInfo[priority] || {
        label: priority,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100'
    };

    const sizeClasses = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
    };

    return (
        <span className={`inline-flex items-center font-medium rounded-full ${sizeClasses[size]} ${info.bgColor} ${info.color}`}>
            {info.label}
        </span>
    );
}
