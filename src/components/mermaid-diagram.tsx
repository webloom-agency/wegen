"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useCopy } from "@/hooks/use-copy";
import { Button } from "ui/button";
import { Clipboard, CheckIcon } from "lucide-react";
import { cn } from "lib/utils";

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const { theme } = useTheme();
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { copied, copy } = useCopy();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load mermaid dynamically to avoid SSR issues
    const loadMermaid = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        
        // Initialize mermaid with theme
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "dark" ? "dark" : "default",
          securityLevel: "loose",
          fontFamily: "inherit",
        });
        
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, chart);
        setSvg(svg);
        setError(null);
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        setError(err instanceof Error ? err.message : "Failed to render diagram");
      } finally {
        setLoading(false);
      }
    };

    loadMermaid();
  }, [chart, theme]);

  return (
    <div className="relative bg-accent/30 flex flex-col rounded-2xl overflow-hidden border">
      <div className="w-full flex z-20 py-2 px-4 items-center">
        <span className="text-sm text-muted-foreground">mermaid</span>
        <Button
          size="icon"
          variant={copied ? "secondary" : "ghost"}
          className="ml-auto z-10 p-3! size-2! rounded-sm"
          onClick={() => {
            copy(chart);
          }}
        >
          {copied ? <CheckIcon /> : <Clipboard className="size-3!" />}
        </Button>
      </div>
      <div className="px-6 pb-6">
        {loading ? (
          <div className="animate-pulse flex items-center justify-center h-20 w-full">
            <div className="text-sm text-muted-foreground">Rendering diagram...</div>
          </div>
        ) : error ? (
          <div className="text-red-500 p-4">
            <p>Error rendering Mermaid diagram:</p>
            <pre className="mt-2 p-2 bg-red-100 dark:bg-red-900/20 rounded text-xs overflow-auto">{error}</pre>
            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">{chart}</pre>
          </div>
        ) : (
          <div 
            ref={containerRef}
            className={cn("flex justify-center transition-opacity", loading ? "opacity-0" : "opacity-100")}
            dangerouslySetInnerHTML={{ __html: svg }} 
          />
        )}
      </div>
    </div>
  );
}