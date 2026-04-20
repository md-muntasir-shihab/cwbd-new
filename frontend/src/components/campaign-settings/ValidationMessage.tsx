interface ValidationMessageProps {
    message?: string;
}

export default function ValidationMessage({ message }: ValidationMessageProps) {
    if (!message) return null;
    return <p className="mt-1 text-xs text-rose-400">{message}</p>;
}
