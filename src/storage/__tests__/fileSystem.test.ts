import { describe, it, expect, vi } from "vitest";
import {
  WriteQueue,
  ensurePermission,
  readReport,
  type DataFileHandle,
} from "../fileSystem";
import { emptyReport, ReportState } from "../../model/types";

function report(tag: string): ReportState {
  return { ...emptyReport(), branchId: tag };
}

describe("WriteQueue", () => {
  it("never overlaps two writes", async () => {
    let active = 0;
    let maxActive = 0;
    const q = new WriteQueue(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    q.enqueue(report("a"));
    q.enqueue(report("b"));
    q.enqueue(report("c"));
    await q.idle();
    expect(maxActive).toBe(1);
  });

  it("coalesces bursts and always persists the latest state", async () => {
    const written: string[] = [];
    const q = new WriteQueue(async (r) => {
      await new Promise((res) => setTimeout(res, 5));
      written.push(r.branchId!);
    });
    q.enqueue(report("v1")); // starts running
    q.enqueue(report("v2")); // coalesced away
    q.enqueue(report("v3")); // latest
    await q.idle();
    expect(written[written.length - 1]).toBe("v3");
    expect(written).not.toContain("v2");
  });
});

function fakeHandle(
  query: "granted" | "denied" | "prompt",
  request: "granted" | "denied" | "prompt" = "granted",
  fileText?: string,
): DataFileHandle & { requested: boolean } {
  return {
    name: "data.json",
    requested: false,
    queryPermission: vi.fn(async () => query),
    requestPermission: vi.fn(async function (this: { requested: boolean }) {
      return request;
    }),
    getFile: async () => ({ text: async () => fileText ?? "" }) as File,
    createWritable: async () => ({ write: async () => {}, close: async () => {} }),
  } as unknown as DataFileHandle & { requested: boolean };
}

describe("ensurePermission", () => {
  it("returns true without prompting when already granted", async () => {
    const h = fakeHandle("granted");
    expect(await ensurePermission(h, false)).toBe(true);
    expect(h.requestPermission).not.toHaveBeenCalled();
  });

  it("does not prompt in non-interactive mode", async () => {
    const h = fakeHandle("prompt");
    expect(await ensurePermission(h, false)).toBe(false);
    expect(h.requestPermission).not.toHaveBeenCalled();
  });

  it("prompts interactively and honours the grant", async () => {
    const h = fakeHandle("prompt", "granted");
    expect(await ensurePermission(h, true)).toBe(true);
    expect(h.requestPermission).toHaveBeenCalledOnce();
  });

  it("returns false when the interactive prompt is denied", async () => {
    const h = fakeHandle("prompt", "denied");
    expect(await ensurePermission(h, true)).toBe(false);
  });
});

describe("readReport", () => {
  it("parses and validates a report file", async () => {
    const r = report("xtreme");
    const h = fakeHandle("granted", "granted", JSON.stringify(r));
    expect((await readReport(h)).branchId).toBe("xtreme");
  });

  it("rejects a file that is not a report", async () => {
    const h = fakeHandle("granted", "granted", JSON.stringify({ foo: 1 }));
    await expect(readReport(h)).rejects.toThrow(/nie jest poprawnym raportem/);
  });
});
