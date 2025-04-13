import Link from "next/link";
import React, { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { PreBlock } from "./pre-block";
import { isJson, toAny } from "lib/utils";
import JsonView from "ui/json-view";

const components: Partial<Components> = {
  code: ({ children }) => {
    return (
      <code className="text-sm rounded-md mx-1 text-blue-400">
        `{children}`
      </code>
    );
  },
  blockquote: ({ children }) => {
    return (
      <blockquote className="relative flex items-center border-accent-foreground/30 border border-dashed p-6 rounded-lg my-6 overflow-hidden">
        {children}
        <div className="absolute top-0 right-0 h-full w-1/3 bg-gradient-to-r from-transparent to-background  pointer-events-none" />
      </blockquote>
    );
  },
  p: ({ children }) => {
    return <p className="leading-6 my-4">{children}</p>;
  },
  pre: ({ children }) => {
    return <PreBlock>{children}</PreBlock>;
  },
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="px-8 list-decimal list-outside" {...props}>
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-2" {...props}>
        {children}
      </li>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="px-8 list-decimal list-outside" {...props}>
        {children}
      </ul>
    );
  },
  strong: ({ node, children, ...props }) => {
    return (
      <span className="font-semibold" {...props}>
        {children}
      </span>
    );
  },
  a: ({ node, children, ...props }) => {
    return (
      <Link
        className="underline hover:text-blue-400"
        target="_blank"
        rel="noreferrer"
        {...toAny(props)}
      >
        <b>{children}</b>
      </Link>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="text-3xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="text-2xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="text-xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4 className="text-lg font-semibold mt-6 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5 className="text-base font-semibold mt-6 mb-2" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6 className="text-sm font-semibold mt-6 mb-2" {...props}>
        {children}
      </h6>
    );
  },
  img: ({ node, children, ...props }) => {
    const { src, alt, ...rest } = props;

    // eslint-disable-next-line @next/next/no-img-element
    return <img className="mx-auto rounded-lg" src={src} alt={alt} {...rest} />;
  },
};

const remarkPlugins = [remarkGfm];

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  return (
    <article className="w-full h-full relative">
      {isJson(children) ? (
        <JsonView data={children} />
      ) : (
        <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
          {children}
        </ReactMarkdown>
      )}
    </article>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);
