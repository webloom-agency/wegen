"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useCopy } from "@/hooks/use-copy";
import { Button } from "ui/button";
import { Clipboard, CheckIcon } from "lucide-react";

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const { theme } = useTheme();
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renderAttempted, setRenderAttempted] = useState(false);
  const { copied, copy } = useCopy();
  const containerRef = useRef<HTMLDivElement>(null);
  const previousChartRef = useRef<string>(chart);

  useEffect(() => {
    // Reset states if chart has changed
    if (previousChartRef.current !== chart) {
      setLoading(true);
      setError(null);
      setRenderAttempted(false);
      previousChartRef.current = chart;
    }

    // Debounce rendering to avoid flickering during streaming
    const renderTimeout = setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        
        // Initialize mermaid with theme
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "dark" ? "dark" : "default",
          securityLevel: "loose",
          fontFamily: "inherit",
          logLevel: 1, // Reduce console noise
        });
        
        // Try to parse first - if this fails, don't attempt rendering
        try {
          mermaid.parse(chart);
        } catch (_parseError) {
          // If parsing fails, silently wait for more complete content
          // Don't show an error, just keep loading state
          return;
        }
        
        // Only proceed to rendering if parse was successful
        setRenderAttempted(true);
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, chart);
        setSvg(svg);
        setError(null);
        setLoading(false);
      } catch (err) {
        // Only show errors if this wasn't a transient state during streaming
        if (renderAttempted) {
          console.error("Mermaid rendering error:", err);
          setError(err instanceof Error ? err.message : "Failed to render diagram");
          setLoading(false);
        }
      }
    }, 300); // Delay rendering to avoid flickering during streaming

    return () => {
      clearTimeout(renderTimeout);
    };
  }, [chart, theme, renderAttempted]);

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
          <div className="flex items-center justify-center h-20 w-full">
            <div className="text-sm text-muted-foreground">Rendering diagram...</div>
          </div>
        ) : error && renderAttempted ? (
          <div className="text-red-500 p-4">
            <p>Error rendering Mermaid diagram:</p>
            <pre className="mt-2 p-2 bg-red-100 dark:bg-red-900/20 rounded text-xs overflow-auto">{error}</pre>
            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">{chart}</pre>
          </div>
        ) : (
          <div 
            ref={containerRef}
            className="flex justify-center transition-opacity duration-200"
            dangerouslySetInnerHTML={{ __html: svg }} 
          />
        )}
      </div>
    </div>
  );
}