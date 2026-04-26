import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
    children: string;
    /** When true, renders inline (wraps in <span> instead of <p>) */
    inline?: boolean;
    className?: string;
}

/**
 * Renders text with KaTeX math support via ReactMarkdown.
 * Supports both inline ($...$) and block ($$...$$) math expressions.
 */
export default function MathText({ children, inline, className }: MathTextProps) {
    if (!children) return null;

    return (
        <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            className={className}
            components={inline ? { p: ({ children: c }) => <span>{c}</span> } : undefined}
        >
            {children}
        </ReactMarkdown>
    );
}
