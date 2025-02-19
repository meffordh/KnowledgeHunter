import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownErrorBoundary } from './markdown-error-boundary';

interface SafeMarkdownProps {
  content: string;
}

export function SafeMarkdown({ content }: SafeMarkdownProps) {
  // Clean up content by removing HTML anchor tags and fixing formatting
  const cleanContent = content
    .replace(/<a\s+name="[^"]*"><\/a>/g, '') // Remove empty anchor tags
    .replace(/(<\/?)h([1-6])(>)/g, '$1h$2$3\n\n') // Ensure headers have proper spacing
    .replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines

  return (
    <MarkdownErrorBoundary>
      <div className="markdown-content prose prose-slate dark:prose-invert max-w-none">
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
              <th className="border border-gray-300 p-2 text-left font-bold bg-gray-50" {...props} />
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
            // Handle links with proper styling and scrolling for internal links
            a: ({ href, children, ...props }) => {
              const isExternal = href?.startsWith('http');
              const handleClick = (e: React.MouseEvent) => {
                if (!isExternal && href?.startsWith('#')) {
                  e.preventDefault();
                  const element = document.getElementById(href.slice(1));
                  element?.scrollIntoView({ behavior: 'smooth' });
                }
              };

              return (
                <a
                  href={href}
                  className="text-primary hover:underline"
                  onClick={handleClick}
                  {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  {...props}
                >
                  {children}
                </a>
              );
            },
            // Handle images with proper fallbacks
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
                <div className="my-4">
                  <img
                    src={src}
                    alt={alt}
                    onError={handleError}
                    className="max-w-full h-auto rounded-lg"
                    loading="lazy"
                    {...props}
                  />
                  {alt && <p className="text-sm text-muted-foreground mt-2">{alt}</p>}
                </div>
              );
            },
            // Handle code blocks with proper styling
            code: ({ node, inline, className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : '';

              if (inline) {
                return (
                  <code className="px-1 py-0.5 bg-muted rounded text-sm" {...props}>
                    {children}
                  </code>
                );
              }

              return (
                <div className="relative">
                  {language && (
                    <div className="absolute right-2 top-2 text-xs text-muted-foreground">
                      {language}
                    </div>
                  )}
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            },
            // Style lists for better readability
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
          {cleanContent}
        </ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
}