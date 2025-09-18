import "server-only";
import { JSONSchema7 } from "json-schema";
import { tool as createTool } from "ai";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { safe } from "ts-safe";

const API_BASE_URL = "https://app.seelab.ai/api/predict";
const API_KEY = process.env.SEELAB_API_KEY;

// Simple in-memory queue to serialize Seelab calls and avoid rate limiting when multiple
// tool invocations are triggered at once.
const queueTails = new Map<string, Promise<any>>();
async function enqueue<T>(key: string, task: () => Promise<T>, onWait?: (ms: number) => void): Promise<T> {
  const prev = queueTails.get(key) || Promise.resolve();
  const startedAt = Date.now();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const waitMs = Date.now() - startedAt;
      if (waitMs > 0) onWait?.(waitMs);
      return task();
    });
  // Ensure the tail continues even if this task fails
  queueTails.set(key, next.catch(() => {}));
  try {
    const result = await next;
    return result;
  } finally {
    // Clean up if this is still the tail
    if (queueTails.get(key) === next) queueTails.delete(key);
  }
}

export const seelabTextToImageSchema: JSONSchema7 = {
  type: "object",
  properties: {
    prompt: {
      type: "string",
      description: "Text description to generate image(s) from. If omitted, will use the last user message.",
    },
    styleId: {
      type: "number",
      description: "Model/style ID. Default flux-hd (1003)",
      default: 1003,
    },
    projectId: {
      type: "number",
      description: "Associate the request with a specific project",
    },
    samples: {
      anyOf: [{ type: "number" }, { type: "string" }],
      description: "Number of images to generate",
      default: 1,
    },
    seed: {
      type: "number",
      description: "Random seed (0 for random)",
      default: 0,
    },
    aspectRatio: {
      type: "string",
      description: "Aspect ratio like '1:1', '16:9', '3:4'",
      default: "1:1",
    },
    pollingIntervalSec: {
      type: "number",
      description: "Polling interval in seconds",
      default: 3,
      minimum: 1,
      maximum: 30,
    },
    timeoutSec: {
      type: "number",
      description: "Maximum time to wait for completion in seconds",
      default: 180,
      minimum: 5,
      maximum: 600,
    },
    verbose: {
      type: "boolean",
      description: "Include detailed logs and timing in the tool result",
      default: true,
    },
    queue: {
      type: "boolean",
      description: "Queue requests to avoid parallel Seelab calls (reduces rate limit errors)",
      default: true,
    },
    queueKey: {
      type: "string",
      description: "Optional queue key for grouping. Defaults to a global Seelab queue.",
    },
  },
  required: [],
};

type SeelabPollResult = {
  id: string;
  state: "scheduled" | "running" | "succeed" | "failed";
  result?: {
    image?: Array<
      {
        id: number;
        type: "input" | "result";
        url?: string;
        links?: { original?: string; small?: string; medium?: string; large?: string };
      }
    >;
  };
  job?: { error?: string };
};

export const seelabTextToImageTool = createTool({
  description:
    "Generate image(s) from text using Seelab. Starts a session and polls until finished, returning resulting image URLs.",
  parameters: jsonSchemaToZod(seelabTextToImageSchema),
  execute: async (params, { messages }) => {
    const logs: any[] = [];
    const log = (event: string, data?: Record<string, any>) => {
      try {
        logs.push({ event, at: new Date().toISOString(), ...(data || {}) });
      } catch {}
    };
    return safe(async () => {
      if (!API_KEY) {
        throw new Error("SEELAB_API_KEY is not configured");
      }

      const {
        prompt,
        styleId = 1003,
        projectId,
        samples = 1,
        seed = 0,
        aspectRatio = "1:1",
        pollingIntervalSec = 3,
        timeoutSec = 180,
        verbose = true,
        queue = true,
        queueKey,
      } = params as any;

      // Fallback: derive prompt from last user message if not provided
      const derivedPrompt = (() => {
        if (typeof prompt === "string" && prompt.trim().length > 0) return prompt.trim();
        // Attempt to get the last user message content
        const reversed = [...(messages || [])].reverse();
        for (const m of reversed) {
          try {
            if (m.role === "user") {
              // Prefer content string if present
              if (typeof (m as any).content === "string" && (m as any).content.trim()) {
                return (m as any).content.trim();
              }
              // Fallback: aggregate text parts
              const parts = (m as any).parts || [];
              const text = parts
                .filter((p: any) => p?.type === "text" && typeof p.text === "string")
                .map((p: any) => p.text)
                .join(" ")
                .trim();
              if (text) return text;
            }
          } catch {}
        }
        return "";
      })();
      if (!derivedPrompt) {
        throw new Error("Missing prompt. Provide a 'prompt' argument or include text in your last message.");
      }
      log("config", { styleId, projectId, samples: Number(samples), seed, aspectRatio, pollingIntervalSec, timeoutSec, promptPreview: derivedPrompt.slice(0, 80) });

      const runOnce = async () => {
        // Initiate prediction session
        const startAt = Date.now();
        const startUrl = `${API_BASE_URL}/text-to-image${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`;
        log("start_request", { url: startUrl });
        const startResponse = await fetch(startUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            Authorization: `Token ${API_KEY}`,
          },
          body: JSON.stringify({
            styleId,
            params: {
              prompt: derivedPrompt,
              samples: String(samples),
              seed,
              aspectRatio,
            },
          }),
        });
        log("start_response", { status: startResponse.status, statusText: startResponse.statusText, ms: Date.now() - startAt });
        if (startResponse.status === 401) {
          throw new Error("Invalid SEELAB API key");
        }
        if (startResponse.status === 429) {
          throw new Error("Seelab rate limit exceeded. Please retry later.");
        }
        if (!startResponse.ok) {
          const text = await startResponse.text();
          throw new Error(`Seelab start error: ${startResponse.status} ${startResponse.statusText} - ${text}`);
        }
        const startJson = (await startResponse.json()) as { id: string; state: string };
        const sessionId = startJson.id;
        log("session_created", { sessionId, initialState: startJson.state });

        // Poll until completion
        const started = Date.now();
        const deadline = started + timeoutSec * 1000;
        let lastState: string | undefined = startJson.state;
        // Small initial delay to avoid immediately hitting rate limits
        await new Promise((r) => setTimeout(r, Math.max(500, pollingIntervalSec * 250)));
        while (Date.now() < deadline) {
          const pollUrl = `${API_BASE_URL}/session/${encodeURIComponent(sessionId)}`;
          const pollAt = Date.now();
          const pollResp = await fetch(pollUrl, {
            method: "GET",
            headers: {
              accept: "application/json",
              Authorization: `Token ${API_KEY}`,
            },
          });
          if (pollResp.status === 429) {
            // Backoff minimally and continue
            log("poll_rate_limited", { status: pollResp.status, ms: Date.now() - pollAt });
            await new Promise((r) => setTimeout(r, pollingIntervalSec * 1000));
            continue;
          }
          if (!pollResp.ok) {
            const text = await pollResp.text();
            throw new Error(`Seelab poll error: ${pollResp.status} ${pollResp.statusText} - ${text}`);
          }
          const json = (await pollResp.json()) as SeelabPollResult;
          lastState = json.state;
          log("poll_tick", { state: json.state, ms: Date.now() - pollAt });
          if (json.state === "succeed") {
            const images = (json.result?.image || []).filter((img) => img.type === "result");
            const imageUrls = images
              .map((img) => img.links?.original || img.url)
              .filter((u): u is string => typeof u === "string" && !!u);
            log("completed", { imageCount: imageUrls.length });
            const result = {
              sessionId,
              status: json.state,
              imageCount: imageUrls.length,
              imageUrls,
            } as any;
            if (verbose) result.logs = logs;
            return result;
          }
          if (json.state === "failed") {
            log("failed", { error: json.job?.error || "Unknown error" });
            throw new Error(`Image generation failed: ${json.job?.error || "Unknown error"}`);
          }
          await new Promise((r) => setTimeout(r, pollingIntervalSec * 1000));
        }
        log("timeout", { afterSec: timeoutSec, lastState: lastState || "unknown" });
        throw new Error(`Seelab prediction timed out after ${timeoutSec}s (last state: ${lastState || "unknown"})`);
      };

      if (queue) {
        const key = String(queueKey || "seelab-global-queue");
        let waited = 0;
        const result = await enqueue(key, runOnce, (ms) => {
          waited = ms;
          log("queue_wait", { key, waitedMs: ms });
        });
        if (verbose && waited > 0) (result as any).queueWaitMs = waited;
        return result;
      } else {
        return await runOnce();
      }
    })
      .ifFail((e) => {
        return {
          isError: true,
          error: e.message,
          solution:
            "Seelab image generation failed. Verify SEELAB_API_KEY, reduce request rate, or adjust parameters (samples, aspectRatio).",
          logs,
        };
      })
      .unwrap();
  },
});


