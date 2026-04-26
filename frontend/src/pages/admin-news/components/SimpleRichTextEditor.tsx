import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bold, Italic, Link2, List, ListOrdered, Underline } from 'lucide-react';
import DOMPurify from 'dompurify';

interface Props {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

function runCommand(command: string, value?: string) {
    document.execCommand(command, false, value);
}

export default function SimpleRichTextEditor({
    value,
    onChange,
    placeholder = 'Write article content...',
}: Props) {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const [linkDraft, setLinkDraft] = useState('');
    const [linkPromptOpen, setLinkPromptOpen] = useState(false);

    useEffect(() => {
        const el = editorRef.current;
        if (!el) return;
        const sanitized = DOMPurify.sanitize(value || '', { USE_PROFILES: { html: true } });
        if (el.innerHTML !== sanitized) {
            el.innerHTML = sanitized;
        }
    }, [value]);

    function applyLink() {
        const trimmed = linkDraft.trim();
        if (!trimmed) {
            setLinkPromptOpen(false);
            setLinkDraft('');
            return;
        }
        runCommand('createLink', trimmed);
        setLinkPromptOpen(false);
        setLinkDraft('');
        editorRef.current?.focus();
    }

    return (
        <div className="overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-300 bg-slate-100 p-2 dark:border-slate-700 dark:bg-slate-900/90">
                <ToolbarButton label="Bold" onClick={() => runCommand('bold')}>
                    <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Italic" onClick={() => runCommand('italic')}>
                    <Italic className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Underline" onClick={() => runCommand('underline')}>
                    <Underline className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Bullet List" onClick={() => runCommand('insertUnorderedList')}>
                    <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Numbered List" onClick={() => runCommand('insertOrderedList')}>
                    <ListOrdered className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    label="Insert Link"
                    onClick={() => {
                        setLinkPromptOpen(true);
                        setLinkDraft('');
                    }}
                >
                    <Link2 className="h-4 w-4" />
                </ToolbarButton>
                <button
                    type="button"
                    onClick={() => runCommand('removeFormat')}
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Clear
                </button>
            </div>
            {linkPromptOpen ? (
                <div className="border-b border-slate-300 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-950/85">
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            className="input-field min-w-[220px] flex-1"
                            placeholder="https://example.com/article"
                            value={linkDraft}
                            onChange={(event) => setLinkDraft(event.target.value)}
                            autoFocus
                        />
                        <button type="button" className="btn-primary" onClick={applyLink}>
                            Apply link
                        </button>
                        <button
                            type="button"
                            className="btn-outline"
                            onClick={() => {
                                setLinkPromptOpen(false);
                                setLinkDraft('');
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Add a full URL to link the selected text without leaving the editor.
                    </p>
                </div>
            ) : null}

            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => onChange(DOMPurify.sanitize((e.target as HTMLDivElement).innerHTML, { USE_PROFILES: { html: true } }))}
                className="rich-editor-content min-h-[240px] bg-white p-3 text-sm text-slate-900 outline-none dark:bg-slate-900/60 dark:text-slate-100"
                data-placeholder={placeholder}
                style={{ whiteSpace: 'pre-wrap' }}
            />
        </div>
    );
}

function ToolbarButton({
    children,
    onClick,
    label,
}: {
    children: ReactNode;
    onClick: () => void;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="rounded border border-slate-300 p-1.5 text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
            {children}
        </button>
    );
}
