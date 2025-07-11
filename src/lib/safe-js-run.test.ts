import { describe, it, expect, vi } from "vitest";
import { safeJsRun } from "./safe-js-run";

describe("safe-js-run", () => {
  it("should execute basic code with console.log", async () => {
    const result = await safeJsRun("console.log(2 + 3);", {});
    expect("success" in result).toBe(true);
    if ("success" in result) {
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual({ type: "log", args: [5] });
    }
  });

  it("should handle input data", async () => {
    const result = await safeJsRun("console.log(x + y);", { x: 10, y: 5 });
    expect("success" in result).toBe(true);
    if ("success" in result) {
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual({ type: "log", args: [15] });
    }
  });

  it("should work with Math API", async () => {
    const result = await safeJsRun("console.log(Math.max(1, 2, 3));", {});
    expect("success" in result).toBe(true);
    if ("success" in result) {
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual({ type: "log", args: [3] });
    }
  });

  it("should work with JSON API", async () => {
    const result = await safeJsRun(
      'const obj = {name: "test"}; console.log(JSON.stringify(obj));',
      {},
    );
    expect("success" in result).toBe(true);
    if ("success" in result) {
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual({
        type: "log",
        args: ['{"name":"test"}'],
      });
    }
  });

  it("should capture multiple console methods", async () => {
    const result = await safeJsRun(
      'console.log("hello"); console.warn("warning"); console.error("error");',
      {},
    );
    expect("success" in result).toBe(true);
    if ("success" in result) {
      expect(result.logs).toHaveLength(3);
      expect(result.logs[0]).toEqual({ type: "log", args: ["hello"] });
      expect(result.logs[1]).toEqual({ type: "warn", args: ["warning"] });
      expect(result.logs[2]).toEqual({ type: "error", args: ["error"] });
    }
  });

  it("should capture console.log with multiple arguments", async () => {
    const result = await safeJsRun('console.log("hello", "world", 42);', {});
    expect("success" in result).toBe(true);
    if ("success" in result) {
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual({
        type: "log",
        args: ["hello", "world", 42],
      });
    }
  });

  it("should call onLog callback when provided", async () => {
    const onLogSpy = vi.fn();
    const result = await safeJsRun(
      'console.log("test"); console.warn("warning");',
      {},
      5000,
      onLogSpy,
    );

    expect("success" in result).toBe(true);
    expect(onLogSpy).toHaveBeenCalledTimes(2);
    expect(onLogSpy).toHaveBeenCalledWith({ type: "log", args: ["test"] });
    expect(onLogSpy).toHaveBeenCalledWith({ type: "warn", args: ["warning"] });
  });

  it("should handle syntax errors", async () => {
    const result = await safeJsRun("console.log(2 +);", {});
    expect("isError" in result).toBe(true);
    if ("isError" in result) {
      expect(result.error).toContain("Unexpected token");
    }
  });

  it("should block forbidden keywords", async () => {
    const result = await safeJsRun("window.alert('hack');", {});
    expect("isError" in result).toBe(true);
    if ("isError" in result) {
      expect(result.error).toContain("Forbidden keyword: 'window'");
    }
  });

  it("should detect Function constructor", async () => {
    const result = await safeJsRun("new Function('return 1')();", {});
    expect("isError" in result).toBe(true);
    if ("isError" in result) {
      expect(result.error).toContain("Function constructor");
    }
  });

  it("should detect infinite loop patterns", async () => {
    const result = await safeJsRun("while(true) {}", {});
    expect("isError" in result).toBe(true);
    if ("isError" in result) {
      expect(result.error).toContain("Infinite while loop");
    }
  });

  it("should handle code with no console output", async () => {
    const result = await safeJsRun("const x = 5; const y = 10;", {});
    expect("success" in result).toBe(true);
    if ("success" in result) {
      expect(result.logs).toHaveLength(0);
    }
  });

  it("should handle different console methods correctly", async () => {
    const result = await safeJsRun(
      'console.info("info"); console.debug("debug"); console.trace("trace");',
      {},
    );
    expect("success" in result).toBe(true);
    if ("success" in result) {
      expect(result.logs).toHaveLength(3);
      expect(result.logs[0]).toEqual({ type: "info", args: ["info"] });
      expect(result.logs[1]).toEqual({ type: "debug", args: ["debug"] });
      expect(result.logs[2]).toEqual({ type: "trace", args: ["trace"] });
    }
  });
});
