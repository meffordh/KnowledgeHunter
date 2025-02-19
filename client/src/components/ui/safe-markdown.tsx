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
          // Handle tables with proper styling
          table: ({ ...props }) => (
            <table className="border-collapse w-full my-4" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="border border-gray-300 p-2 text-left" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="border border-gray-300 p-2 text-left font-bold" {...props} />
          ),
          // Handle headings with proper IDs for TOC
          h1: ({ children, ...props }) => {
            const id = children?.toString().toLowerCase().replace(/\s+/g, '-');
            return <h1 id={id} className="scroll-mt-20 text-2xl font-bold mt-8 mb-4" {...props}>{children}</h1>;
          },
          h2: ({ children, ...props }) => {
            const id = children?.toString().toLowerCase().replace(/\s+/g, '-');
            return <h2 id={id} className="scroll-mt-20 text-xl font-bold mt-6 mb-3" {...props}>{children}</h2>;
          },
          h3: ({ children, ...props }) => {
            const id = children?.toString().toLowerCase().replace(/\s+/g, '-');
            return <h3 id={id} className="scroll-mt-20 text-lg font-bold mt-4 mb-2" {...props}>{children}</h3>;
          },
          // Handle links with proper styling and external handling
          a: ({ href, children, ...props }) => {
            const isExternal = href?.startsWith('http');
            return (
              <a
                href={href}
                className="text-primary hover:underline"
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                {...props}
              >
                {children}
              </a>
            );
          },
          // Handle images with fallbacks and proper styling
          img: ({ src, alt, ...props }) => {
            const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
              const img = e.currentTarget;
              if (src?.includes('placeholder.com')) {
                img.src = `https://via.placeholder.com/800x400.png?text=${encodeURIComponent(alt || 'Image')}`;
              } else {
                img.src = `https://via.placeholder.com/800x400.png?text=${encodeURIComponent('Image Not Available')}`;
              }
            };

            return (
              <img
                src={src}
                alt={alt}
                onError={handleError}
                className="max-w-full h-auto rounded-lg my-4"
                loading="lazy"
                {...props}
              />
            );
          },
          // Handle lists for TOC and normal content
          ul: ({ ...props }) => (
            <ul className="list-disc list-inside my-4 space-y-2" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal list-inside my-4 space-y-2" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="ml-4" {...props} />
          ),
          // Add proper paragraph spacing
          p: ({ ...props }) => (
            <p className="my-4 leading-relaxed" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </MarkdownErrorBoundary>
  );
}