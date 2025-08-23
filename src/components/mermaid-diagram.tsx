"use client";

import { createDebounce } from "lib/utils";
import { Loader } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";

let mermaidModule: typeof import("mermaid").default | null = null;

const loadMermaid = async () => {
  if (!mermaidModule) {
    mermaidModule = (await import("mermaid")).default;
  }
  return mermaidModule;
};

interface MermaidDiagramProps {
  chart?: string;
}

function convertLegacyLineToXYChartBeta(input: string): string | null {
  const text = input?.trim();
  if (!text?.toLowerCase().startsWith("line")) return null;

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.toLowerCase() !== "line");

  let title: string | undefined;
  let xAxis: string | undefined;
  let yAxis: string | undefined;
  const entries: { label: string; value: string }[] = [];

  for (const l of lines) {
    const lower = l.toLowerCase();
    if (lower.startsWith("title ")) {
      title = l.slice(6).trim();
      continue;
    }
    if (lower.startsWith("x-axis ")) {
      xAxis = l.slice(7).trim();
      continue;
    }
    if (lower.startsWith("y-axis ")) {
      yAxis = l.slice(7).trim();
      continue;
    }

    // Data row pattern: <label>: <number>
    const colonIdx = l.indexOf(":");
    if (colonIdx > 0) {
      const key = l.slice(0, colonIdx).trim();
      const val = l.slice(colonIdx + 1).trim();
      if (key && val) entries.push({ label: key, value: val });
    }
  }

  if (!entries.length) return null;

  const xLabels = entries.map((e) => e.label).join(", ");
  const values = entries.map((e) => e.value).join(", ");

  // Build xychart-beta
  const out: string[] = ["xychart-beta"]; 
  if (title) out.push(`    title: "${title.replaceAll("\"", '\\"')}"`);
  if (xAxis) out.push(`    x-axis: "${xAxis.replaceAll("\"", '\\"')}"`);
  if (yAxis) out.push(`    y-axis: "${yAxis.replaceAll("\"", '\\"')}"`);
  out.push(`    x-labels: ${xLabels}`);
  out.push(`    line "Series": ${values}`);
  return out.join("\n");
}

function convertLegacyBarToXYChartBeta(input: string): string | null {
  const text = input?.trim();
  if (!text?.toLowerCase().startsWith("bar")) return null;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.toLowerCase() !== "bar");

  let title: string | undefined;
  let xAxisTitle: string | undefined;
  let yAxisTitle: string | undefined;
  let xLabels: string[] = [];
  const series: { name: string; values: string }[] = [];

  const parseArray = (raw: string) => {
    const content = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
    // keep quoted labels intact; pass through as comma-separated
    return content
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  for (const l of lines) {
    const lower = l.toLowerCase();
    if (lower.startsWith("title ")) {
      title = l.slice(6).trim();
      continue;
    }
    if (lower.startsWith("x-axis ")) {
      const rest = l.slice(7).trim();
      if (rest.startsWith("[")) {
        xLabels = parseArray(rest);
      } else if (rest.startsWith("\"")) {
        xAxisTitle = rest.replace(/^\"|\"$/g, "");
      } else {
        xAxisTitle = rest;
      }
      continue;
    }
    if (lower.startsWith("y-axis ")) {
      const rest = l.slice(7).trim();
      yAxisTitle = rest.replace(/^\"|\"$/g, "");
      continue;
    }
    if (lower.startsWith("series ")) {
      // series Name: [1,2,3]
      const after = l.slice(7).trim();
      const idx = after.indexOf(":");
      if (idx > 0) {
        const name = after.slice(0, idx).trim().replace(/^\"|\"$/g, "");
        const arrRaw = after.slice(idx + 1).trim();
        const values = parseArray(arrRaw).join(", ");
        series.push({ name, values });
      }
      continue;
    }
    if (lower.startsWith("bar ")) {
      // bar "Name": 1,2,3
      const m = l.match(/^bar\s+\"([^\"]+)\"\s*:\s*(.*)$/i);
      if (m) {
        series.push({ name: m[1], values: parseArray(m[2]).join(", ") });
      }
      continue;
    }
  }

  if (!xLabels.length || !series.length) return null;

  const out: string[] = ["xychart-beta"]; 
  if (title) out.push(`    title: "${title.replaceAll("\"", '\\"')}"`);
  out.push(`    x-axis: "${(xAxisTitle || "").replaceAll("\"", '\\"')}"`);
  if (yAxisTitle) out.push(`    y-axis: "${yAxisTitle.replaceAll("\"", '\\"')}"`);
  out.push(`    x-labels: ${xLabels.join(", ")}`);
  for (const s of series) {
    out.push(`    bar "${s.name.replaceAll("\"", '\\"')}": ${s.values}`);
  }
  return out.join("\n");
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const { theme } = useTheme();
  const [state, setState] = useState<{
    svg: string;
    error: string | null;
    loading: boolean;
  }>({
    svg: "",
    error: null,
    loading: true,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const previousChartRef = useRef<string>(chart);
  const debounce = useMemo(() => createDebounce(), []);

  useEffect(() => {
    // Reset states if chart has changed
    if (previousChartRef.current !== chart) {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      previousChartRef.current = chart;
    }

    // Debounce rendering to avoid flickering during streaming
    debounce(async () => {
      if (!chart?.trim()) {
        setState({ svg: "", error: null, loading: false });
        return;
      }

      try {
        const mermaid = await loadMermaid();

        // Initialize mermaid with theme
        mermaid.initialize({
          startOnLoad: false,
          theme: theme == "dark" ? "dark" : "default",
          securityLevel: "loose",
        });

        // Normalize legacy formats (e.g., top-level 'line'/'bar')
        const normalized =
          convertLegacyBarToXYChartBeta(chart) ||
          convertLegacyLineToXYChartBeta(chart) ||
          chart;

        // First try to parse to catch syntax errors early
        await mermaid.parse(normalized);

        // Render the diagram
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, normalized);

        setState({ svg, error: null, loading: false });
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        setState({
          svg: "",
          error:
            err instanceof Error ? err.message : "Failed to render diagram",
          loading: false,
        });
      }
    }, 500);

    return () => {
      debounce.clear();
    };
  }, [chart, theme, debounce]);

  if (state.loading) {
    return (
      <div className="px-6 overflow-auto">
        <div className="flex items-center justify-center h-20 w-full">
          <div className="text-muted-foreground flex items-center gap-2">
            Rendering diagram <Loader className="size-4 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="px-6 pb-6 overflow-auto">
        <div className="text-destructive p-4">
          <p>Error rendering Mermaid diagram:</p>
          <pre className="mt-2 p-2 bg-destructive/10 dark:bg-destructive/20 rounded text-xs overflow-auto">
            {state.error}
          </pre>
          <pre className="mt-2 p-2 bg-accent/10 dark:bg-accent/20 rounded text-xs overflow-auto">
            {chart}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pb-6 overflow-auto">
      <div
        ref={containerRef}
        className="flex justify-center transition-opacity duration-200 overflow-auto"
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </div>
  );
}
