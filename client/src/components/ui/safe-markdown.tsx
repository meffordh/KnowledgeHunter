import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownErrorBoundary } from './markdown-error-boundary';

interface SafeMarkdownProps {
  content: string;
}

export function SafeMarkdown({ content }: SafeMarkdownProps) {
  return (
    <MarkdownErrorBoundary>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ ...props }) => (
            <table className="border-collapse w-full my-4" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="border border-gray-300 p-2 text-left" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="border border-gray-300 p-2 text-left font-bold" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </MarkdownErrorBoundary>
  );
}