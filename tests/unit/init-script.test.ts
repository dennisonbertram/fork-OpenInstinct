import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("init.sh", () => {
  it("keeps help and check non-mutating", async () => {
    const directory = await fixture();
    const before = await readdir(directory);

    const help = await runInit(directory, ["--help"]);
    const check = await runInit(directory, ["--check"]);

    expect(help.code).toBe(0);
    expect(help.stdout).toContain("--setup-only");
    expect(check.code).toBe(0);
    expect(check.stdout).toContain("Prerequisites are available.");
    expect(await readdir(directory)).toEqual(before);
  });

  it("installs, links the canonical project, and creates a private env", async () => {
    const directory = await fixture({
      linkedEnvironment:
        "KERNEL_API_KEY=linked-kernel\nVERCEL_OIDC_TOKEN=linked-oidc\n",
    });
    const result = await runInit(directory, ["--setup-only"]);
    const created = await readFile(join(directory, ".env.local"), "utf8");

    expect(result.code).toBe(0);
    expect(created).toContain("KERNEL_API_KEY=linked-kernel");
    expect(created).toContain("VERCEL_OIDC_TOKEN=linked-oidc");
    expect((await stat(join(directory, ".env.local"))).mode & 0o777).toBe(
      0o600
    );
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe(
      [
        "pnpm install --frozen-lockfile",
        "pnpm exec eve link --non-interactive --project open-instinct --team dennisons-projects",
        "",
      ].join("\n")
    );
    expect(result.stdout).not.toContain("KERNEL_API_KEY=");
  });

  it("leaves a private manual template and clear login guidance when linking fails", async () => {
    const directory = await fixture({ linkExitCode: 1 });
    const result = await runInit(directory, ["--setup-only"]);
    const created = await readFile(join(directory, ".env.local"), "utf8");
    const template = await readFile(join(directory, ".env.example"), "utf8");

    expect(result.code).toBe(1);
    expect(created).toBe(template);
    expect((await stat(join(directory, ".env.local"))).mode & 0o777).toBe(
      0o600
    );
    expect(result.stderr).toContain("pnpm exec vercel login");
    expect(result.stderr).toContain("KERNEL_API_KEY");
    expect(result.stderr).toContain("AI_GATEWAY_API_KEY");
    expect(result.stdout).not.toContain("KERNEL_API_KEY=");
  });

  it("preserves an existing env and installs during setup-only", async () => {
    const directory = await fixture();
    const existing =
      "KERNEL_API_KEY=placeholder-only\nAI_GATEWAY_API_KEY=gateway\nCUSTOM=value\n";
    await writeFile(join(directory, ".env.local"), existing, { mode: 0o644 });

    const result = await runInit(directory, ["--setup-only"]);

    expect(result.code).toBe(0);
    expect(await readFile(join(directory, ".env.local"), "utf8")).toBe(
      existing
    );
    expect((await stat(join(directory, ".env.local"))).mode & 0o777).toBe(
      0o600
    );
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe(
      "pnpm install --frozen-lockfile\n"
    );
  });

  it("accepts comments, whitespace, and equals signs in the kernel key", async () => {
    const directory = await fixture();
    await writeFile(
      join(directory, ".env.local"),
      "  # local-only comment\n  KERNEL_API_KEY = token=with=equals\n  VERCEL_OIDC_TOKEN = oidc=with=equals\n",
      { mode: 0o600 }
    );

    const result = await runInit(directory, ["--setup-only"]);

    expect(result.code).toBe(0);
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe(
      "pnpm install --frozen-lockfile\n"
    );
  });

  it("links a legacy untouched template when credentials are missing", async () => {
    const directory = await fixture();
    const template = await readFile(join(directory, ".env.example"), "utf8");
    await writeFile(join(directory, ".env.local"), template, { mode: 0o600 });

    const result = await runInit(directory, ["--setup-only", "--skip-install"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("KERNEL_API_KEY=");
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe(
      "pnpm exec eve link --non-interactive --project open-instinct --team dennisons-projects\n"
    );
  });

  it("preserves a customized incomplete env and explains the manual fallback", async () => {
    const directory = await fixture();
    const existing =
      "# local customization\nKERNEL_API_KEY=already-present\nCUSTOM=value\n";
    await writeFile(join(directory, ".env.local"), existing, { mode: 0o600 });

    const result = await runInit(directory, ["--setup-only", "--skip-install"]);

    expect(result.code).toBe(1);
    expect(await readFile(join(directory, ".env.local"), "utf8")).toBe(
      existing
    );
    expect(result.stderr).toContain("preserved");
    expect(result.stderr).toContain("AI_GATEWAY_API_KEY");
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe("");
  });

  it("starts Agentation and delegates the app lifecycle to pnpm dev", async () => {
    const directory = await fixture({ readyEnvironment: true });

    const result = await runInit(directory, ["--skip-install"]);

    expect(result.code).toBe(0);
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe(
      "pnpm dev:agentation\npnpm dev\n"
    );
    expect(await readdir(directory)).not.toContain("agentation-ready");
    expect(await readFile(join(directory, "agentation-stopped"), "utf8")).toBe(
      "stopped\n"
    );
  });

  it("reuses an already healthy Agentation server", async () => {
    const directory = await fixture({
      agentationHealthy: true,
      readyEnvironment: true,
    });

    const result = await runInit(directory, ["--skip-install"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Agentation is already running");
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe(
      "pnpm dev\n"
    );
  });

  it("stops before the app when Agentation fails to start", async () => {
    const directory = await fixture({
      agentationStartExitCode: 1,
      readyEnvironment: true,
    });

    const result = await runInit(directory, ["--skip-install"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Agentation did not become healthy");
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe(
      "pnpm dev:agentation\n"
    );
  });

  it("reports missing and incompatible prerequisites", async () => {
    const missing = await fixture({ omit: "pnpm" });
    const missingResult = await runInit(missing, ["--check"]);
    expect(missingResult.code).toBe(1);
    expect(missingResult.stderr).toContain("Missing prerequisite: pnpm");

    const wrongNode = await fixture({ nodeVersion: "v22.1.0" });
    const wrongNodeResult = await runInit(wrongNode, ["--check"]);
    expect(wrongNodeResult.code).toBe(1);
    expect(wrongNodeResult.stderr).toContain("Node 24 is required");

    const noCompose = await fixture({ dockerCompose: false });
    const noComposeResult = await runInit(noCompose, ["--check"]);
    expect(noComposeResult.code).toBe(1);
    expect(noComposeResult.stderr).toContain("Docker Compose v2 is required");

    const noDaemon = await fixture({ dockerDaemon: false });
    const noDaemonResult = await runInit(noDaemon, ["--check"]);
    expect(noDaemonResult.code).toBe(1);
    expect(noDaemonResult.stderr).toContain("Docker daemon is unavailable");
  });

  it("rejects unknown flags", async () => {
    const directory = await fixture();
    const result = await runInit(directory, ["--not-a-real-option"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown option: --not-a-real-option");
  });
});

async function fixture(
  options: {
    readonly dockerCompose?: boolean;
    readonly dockerDaemon?: boolean;
    readonly agentationHealthy?: boolean;
    readonly agentationStartExitCode?: number;
    readonly linkedEnvironment?: string;
    readonly linkExitCode?: number;
    readonly nodeVersion?: string;
    readonly omit?: "pnpm";
    readonly readyEnvironment?: boolean;
  } = {}
) {
  const directory = await mkdtemp(join(tmpdir(), "open-instinct-init-"));
  temporaryDirectories.push(directory);
  const bin = join(directory, "bin");
  await (await import("node:fs/promises")).mkdir(bin);
  const agentationMarker = join(directory, "agentation-ready");
  const linkedEnvironment = join(directory, "linked.env");
  await writeFile(
    linkedEnvironment,
    options.linkedEnvironment ??
      "KERNEL_API_KEY=linked-kernel\nAI_GATEWAY_API_KEY=linked-gateway\n"
  );
  await writeFile(
    join(directory, "link-exit-code"),
    String(options.linkExitCode ?? 0)
  );
  await writeFile(
    join(directory, "agentation-exit-code"),
    String(options.agentationStartExitCode ?? 0)
  );
  if (options.agentationHealthy) {
    await writeFile(agentationMarker, "ready\n");
  }
  await Promise.all([
    writeFile(
      join(directory, "init.sh"),
      await readFile(new URL("../../init.sh", import.meta.url)),
      { mode: 0o755 }
    ),
    writeFile(
      join(directory, ".env.example"),
      await readFile(new URL("../../.env.example", import.meta.url))
    ),
    writeExecutable(
      join(bin, "node"),
      `#!/bin/sh\nif [ "$1" = "--version" ]; then\n  printf '%s\\n' "${options.nodeVersion ?? "v24.15.0"}"\n  exit 0\nfi\nif [ "$1" = "-e" ]; then\n  test -f "$INIT_AGENTATION_MARKER"\n  exit $?\nfi\nexit 0\n`
    ),
    writeExecutable(
      join(bin, "docker"),
      `#!/bin/sh\nif [ "$1" = "compose" ] && [ "$2" = "version" ]; then\n  ${options.dockerCompose === false ? "exit 1" : "exit 0"}\nfi\nif [ "$1" = "info" ]; then\n  ${options.dockerDaemon === false ? "exit 1" : "exit 0"}\nfi\nexit 0\n`
    ),
    writeFile(join(directory, "commands.log"), ""),
  ]);
  if (options.omit !== "pnpm") {
    await writeExecutable(
      join(bin, "pnpm"),
      `#!/bin/sh\nprintf 'pnpm %s\\n' "$*" >> "$INIT_LOG"\ncase "$*" in\n  "exec eve link "*)\n    if [ "$INIT_LINK_EXIT" -ne 0 ]; then\n      printf 'PARTIAL_ENV=must-not-survive\\n' > .env.local\n      exit "$INIT_LINK_EXIT"\n    fi\n    cat "$INIT_LINK_ENV" >> .env.local\n    ;;\n  "dev:agentation")\n    if [ "$INIT_AGENTATION_EXIT" -ne 0 ]; then exit "$INIT_AGENTATION_EXIT"; fi\n    # A healthy server stays alive until init.sh tears it down.\n    trap 'rm -f "$INIT_AGENTATION_MARKER"; printf "stopped\\n" > "$INIT_AGENTATION_STOPPED"; exit 0' TERM INT\n    : > "$INIT_AGENTATION_MARKER"\n    while :; do sleep 0.1; done\n    ;;\nesac\n`
    );
  }
  if (options.readyEnvironment) {
    await writeFile(
      join(directory, ".env.local"),
      "KERNEL_API_KEY=test-kernel\nVERCEL_OIDC_TOKEN=test-oidc\n",
      { mode: 0o600 }
    );
  }
  return directory;
}

async function writeExecutable(path: string, contents: string) {
  await writeFile(path, contents, { mode: 0o755 });
  await chmod(path, 0o755);
}

async function runInit(directory: string, args: readonly string[] = []) {
  const bin = join(directory, "bin");
  const linkExitCode = await readFile(
    join(directory, "link-exit-code"),
    "utf8"
  );
  const agentationExitCode = await readFile(
    join(directory, "agentation-exit-code"),
    "utf8"
  );
  const result = spawnSync("/bin/bash", [join(directory, "init.sh"), ...args], {
    cwd: directory,
    env: {
      INIT_LOG: join(directory, "commands.log"),
      INIT_AGENTATION_MARKER: join(directory, "agentation-ready"),
      INIT_AGENTATION_STOPPED: join(directory, "agentation-stopped"),
      INIT_AGENTATION_EXIT: agentationExitCode,
      INIT_LINK_ENV: join(directory, "linked.env"),
      INIT_LINK_EXIT: linkExitCode,
      NODE_ENV: "test",
      PATH: `${bin}:/usr/bin:/bin`,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    code: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}
