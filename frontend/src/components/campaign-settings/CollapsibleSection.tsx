import { useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

interface CollapsibleSectionProps {
    icon: LucideIcon;
    title: string;
    defaultOpen?: boolean;
    children: ReactNode;
}

export default function CollapsibleSection({ icon: Icon, title, defaultOpen = false, children }: CollapsibleSectionProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <section className="card-flat overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 p-4 sm:p-5 text-left"
            >
                <h2 className="flex items-center gap-2 text-lg font-semibold cw-text">
                    <Icon className="h-5 w-5 text-primary" />
                    {title}
                </h2>
                <ChevronDown
                    className={`h-5 w-5 cw-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            <div
                className={`transition-all duration-200 ease-in-out ${open ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}
            >
                <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-4">
                    {children}
                </div>
            </div>
        </section>
    );
}
