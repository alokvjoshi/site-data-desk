import ReactMarkdown from "react-markdown";

export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose-sdd ${className}`}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
