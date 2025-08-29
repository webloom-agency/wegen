import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, mkdir, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import { CodeRunnerOptions, CodeRunnerResult, LogEntry } from "./code-runner.interface";

const pExecFile = promisify(execFile);

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function parseImports(code: string): string[] {
  const pkgs = new Set<string>();
  const lines = code.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("#") || t.startsWith("\"\"\"")) continue;
    const m1 = t.match(/^import\s+([a-zA-Z0-9_\.,\s]+)/);
    if (m1) {
      m1[1]
        .split(",")
        .map((s) => s.trim().split(".")[0])
        .forEach((n) => n && pkgs.add(n));
      continue;
    }
    const m2 = t.match(/^from\s+([a-zA-Z0-9_\.]+)\s+import\s+/);
    if (m2) {
      const name = m2[1].split(".")[0];
      if (name) pkgs.add(name);
    }
  }
  const blacklist = new Set([
    "sys",
    "os",
    "json",
    "re",
    "math",
    "time",
    "random",
    "datetime",
    "io",
    "itertools",
    "collections",
    "statistics",
    "pathlib",
    "typing",
    "functools",
    "subprocess",
    "hashlib",
    "base64",
    "uuid",
    "csv",
    "argparse",
    "heapq",
    "bisect",
    "pprint",
    "shutil",
    "tempfile",
    "traceback",
    "unittest",
    "threading",
    "asyncio",
  ]);
  return Array.from(pkgs).filter((n) => !blacklist.has(n));
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string) {
  if (!(await pathExists(p))) await mkdir(p, { recursive: true });
}

async function detectPython(): Promise<string> {
  try {
    await pExecFile("python3", ["--version"]);
    return "python3";
  } catch {}
  await pExecFile("python", ["--version"]);
  return "python";
}

async function ensureVenv(baseDir: string, pythonBin: string) {
  const venvDir = join(baseDir, "venv");
  const isWin = typeof process !== "undefined" && process.platform === "win32";
  const bin = isWin ? join(venvDir, "Scripts") : join(venvDir, "bin");
  const vpython = join(bin, isWin ? "python.exe" : "python");
  const vpip = join(bin, isWin ? "pip.exe" : "pip");
  if (!(await pathExists(vpython))) {
    await pExecFile(pythonBin, ["-m", "venv", venvDir]);
  }
  return { venvDir, vpython, vpip };
}

export async function runPythonServer({ code, timeout = 30000, onLog }: CodeRunnerOptions & { params?: any }): Promise<CodeRunnerResult> {
  const startTime = Date.now();
  const logs: LogEntry[] = [];

  const python = await detectPython();

  const pkgs = parseImports(code);
  const key = sha1(pkgs.sort().join(","));
  const baseDir = join(tmpdir(), "workflow-python", key);
  await ensureDir(baseDir);

  const { vpython, vpip } = await ensureVenv(baseDir, python);

  if (pkgs.length > 0) {
    try {
      await pExecFile(vpip, ["install", "--disable-pip-version-check", "--quiet", ...pkgs], { timeout });
    } catch (e: any) {
      logs.push({ type: "error", args: [{ type: "data", value: `pip install failed: ${e?.message || e}` }] });
    }
  }

  const resultSentinel = "__WF_RESULT__";
  const wrapper = [
    "# Injected params and result capture",
    "import json",
    "params = __WF_PARAMS__",
    code,
    "try:",
    "    _wf_serialized = json.dumps(result)",
    "except Exception as _e:",
    "    _wf_serialized = json.dumps(str(locals().get('result', None)))",
    `print("${resultSentinel}:" + _wf_serialized)`,
    "",
  ].join("\n");

  const dir = await mkdtemp(join(tmpdir(), "wfpy-"));
  const mainPath = join(dir, "main.py");
  const paramsJson = JSON.stringify((arguments as any)[0]?.params ?? {});
  const finalCode = wrapper.replace("__WF_PARAMS__", paramsJson);
  await writeFile(mainPath, finalCode, "utf8");

  try {
    const { stdout, stderr } = await pExecFile(vpython, ["-I", mainPath], { timeout });
    if (stderr?.trim()) logs.push({ type: "error", args: [{ type: "data", value: stderr }] });
    if (stdout?.length) logs.push({ type: "log", args: [{ type: "data", value: stdout }] });
    onLog?.({ type: "log", args: [{ type: "data", value: stdout }] });

    let parsed: any = undefined;
    const match = stdout.split(/\r?\n/).find((l) => l.startsWith(resultSentinel + ":"));
    if (match) {
      const payload = match.substring((resultSentinel + ":").length);
      try {
        parsed = JSON.parse(payload);
      } catch {
        parsed = payload;
      }
    }

    return {
      success: true,
      logs,
      executionTimeMs: Date.now() - startTime,
      result: parsed,
    };
  } catch (e: any) {
    logs.push({ type: "error", args: [{ type: "data", value: e?.message || String(e) }] });
    return {
      success: false,
      error: e?.message || "Python execution failed",
      logs,
      executionTimeMs: Date.now() - startTime,
    };
  }
} 