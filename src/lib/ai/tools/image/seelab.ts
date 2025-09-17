import "server-only";
import { JSONSchema7 } from "json-schema";
import { tool as createTool } from "ai";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { safe } from "ts-safe";

const API_BASE_URL = "https://app.seelab.ai/api/predict";
const API_KEY = process.env.SEELAB_API_KEY;

export const seelabTextToImageSchema: JSONSchema7 = {
  type: "object",
  properties: {
    prompt: {
      type: "string",
      description: "Text description to generate image(s) from",
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
  },
  required: ["prompt"],
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
  execute: async (params) => {
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
      } = params as any;

      // Initiate prediction session
      const startResponse = await fetch(`${API_BASE_URL}/text-to-image${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          Authorization: `Token ${API_KEY}`,
        },
        body: JSON.stringify({
          styleId,
          params: {
            prompt,
            samples: String(samples),
            seed,
            aspectRatio,
          },
        }),
      });

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

      // Poll until completion
      const started = Date.now();
      const deadline = started + timeoutSec * 1000;
      let lastState: string | undefined = startJson.state;
      // Small initial delay to avoid immediately hitting rate limits
      await new Promise((r) => setTimeout(r, Math.max(500, pollingIntervalSec * 250)));
      while (Date.now() < deadline) {
        const pollResp = await fetch(`${API_BASE_URL}/session/${encodeURIComponent(sessionId)}`, {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `Token ${API_KEY}`,
          },
        });
        if (pollResp.status === 429) {
          // Backoff minimally and continue
          await new Promise((r) => setTimeout(r, pollingIntervalSec * 1000));
          continue;
        }
        if (!pollResp.ok) {
          const text = await pollResp.text();
          throw new Error(`Seelab poll error: ${pollResp.status} ${pollResp.statusText} - ${text}`);
        }
        const json = (await pollResp.json()) as SeelabPollResult;
        lastState = json.state;
        if (json.state === "succeed") {
          const images = (json.result?.image || []).filter((img) => img.type === "result");
          const imageUrls = images
            .map((img) => img.links?.original || img.url)
            .filter((u): u is string => typeof u === "string" && !!u);
          return {
            sessionId,
            status: json.state,
            imageCount: imageUrls.length,
            imageUrls,
          };
        }
        if (json.state === "failed") {
          throw new Error(`Image generation failed: ${json.job?.error || "Unknown error"}`);
        }
        await new Promise((r) => setTimeout(r, pollingIntervalSec * 1000));
      }
      throw new Error(`Seelab prediction timed out after ${timeoutSec}s (last state: ${lastState || "unknown"})`);
    })
      .ifFail((e) => {
        return {
          isError: true,
          error: e.message,
          solution:
            "Seelab image generation failed. Verify SEELAB_API_KEY, reduce request rate, or adjust parameters (samples, aspectRatio).",
        };
      })
      .unwrap();
  },
});


