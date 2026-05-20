import { describe, expect, test } from "bun:test";

import { clampLines, readConfig } from "../extensions/rtk/config.ts";
import { buildLatexRewrite, isLatexCommand, shellQuote } from "../extensions/rtk/latex.ts";
import { rewriteCommand } from "../extensions/rtk/rewrite.ts";
import { checkRtkInstallation, formatVersion } from "../extensions/rtk/version.ts";

describe("rtk config", () => {
  test("reads environment flags with safe defaults", () => {
    expect(readConfig({})).toEqual({
      disabled: false,
      askMode: "auto",
      awareness: true,
      timeoutMs: 2000,
      quiet: false,
      latex: true,
    });
    expect(
      readConfig({
        PI_RTK_DISABLED: "1",
        PI_RTK_ASK_MODE: "confirm",
        PI_RTK_AWARENESS: "0",
        PI_RTK_TIMEOUT_MS: "5000",
        PI_RTK_QUIET: "1",
        PI_RTK_LATEX: "0",
      }),
    ).toEqual({
      disabled: true,
      askMode: "confirm",
      awareness: false,
      timeoutMs: 5000,
      quiet: true,
      latex: false,
    });
  });

  test("clamps widget output lines", () => {
    expect(clampLines("a\nb\nc", 2)).toEqual(["a", "b", "... (1 more line(s) truncated)"].map((line) => line.replace("...", "…")));
  });
});

describe("rtk rewrite", () => {
  test("maps rtk rewrite exit codes to outcomes", async () => {
    const pi = {
      async exec(_cmd: string, _args: string[]) {
        return { code: 0, killed: false, stdout: "rtk git status\n", stderr: "" };
      },
    };
    expect(await rewriteCommand(pi as any, "git status")).toEqual({ kind: "rewrite", command: "rtk git status" });

    const askPi = {
      async exec() {
        return { code: 3, killed: false, stdout: "rtk find foo\n", stderr: "" };
      },
    };
    expect(await rewriteCommand(askPi as any, "find . -name foo")).toEqual({ kind: "ask", command: "rtk find foo" });

    const unchangedPi = {
      async exec() {
        return { code: 1, killed: false, stdout: "", stderr: "" };
      },
    };
    expect(await rewriteCommand(unchangedPi as any, "echo hi")).toEqual({ kind: "unchanged" });
  });
});

describe("rtk version", () => {
  test("checks installed rtk version from command output", async () => {
    expect(formatVersion({ major: 0, minor: 23, patch: 0 })).toBe("0.23.0");

    const okPi = {
      async exec() {
        return { code: 0, killed: false, stdout: "rtk 0.37.2\n", stderr: "" };
      },
    };
    expect(await checkRtkInstallation(okPi as any)).toEqual({ kind: "ok", version: "0.37.2" });

    const oldPi = {
      async exec() {
        return { code: 0, killed: false, stdout: "rtk 0.22.9\n", stderr: "" };
      },
    };
    expect(await checkRtkInstallation(oldPi as any)).toEqual({ kind: "too-old", version: "0.22.9", minVersion: "0.23.0" });
  });
});

describe("rtk latex", () => {
  test("detects and wraps latex commands", () => {
    expect(isLatexCommand("latexmk -pdf main.tex")).toBe(true);
    expect(isLatexCommand("PI_RTK_LATEX=0 latexmk -pdf main.tex")).toBe(false);
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
    const rewritten = buildLatexRewrite("latexmk -pdf main.tex", "/tmp/latex-runner.mjs");
    expect(rewritten).toStartWith("node '/tmp/latex-runner.mjs' '");
  });
});
