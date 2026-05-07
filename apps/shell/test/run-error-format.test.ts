import { describe, expect, test } from "bun:test";
import { type DomainError } from "@appaloft/core";
import { formatDomainError } from "../src/run";

describe("shell domain error formatting", () => {
  test("prints SSH remote-state resolution diagnostics from safe details", () => {
    const error: DomainError = {
      code: "infra_error",
      category: "infra",
      message: "SSH remote state could not be prepared",
      retryable: true,
      details: {
        phase: "remote-state-resolution",
        stateBackend: "ssh-pglite",
        host: "203.0.113.10",
        port: "22",
        exitCode: 1,
        stderr:
          "mkdir: cannot create directory '/var/lib/appaloft/runtime/state': No space left on device\n",
      },
      knowledge: {
        responsibility: "operator",
        actionability: "run-diagnostic",
        links: [
          {
            rel: "human-doc",
            href: "/docs/observe/diagnostics/#runtime-target-capacity-inspect",
          },
          {
            rel: "llm-guide",
            href: "/docs/.well-known/appaloft/errors/infra_error.remote-state-resolution.json",
          },
        ],
        remedies: [
          {
            kind: "diagnostic",
            label:
              "Inspect the SSH target capacity when remote state preparation reports no space or write failures.",
            safeByDefault: true,
          },
        ],
      },
    };

    const output = formatDomainError(error);

    expect(output).toContain("SSH remote state could not be prepared");
    expect(output).toContain("code=infra_error category=infra phase=remote-state-resolution");
    expect(output).toContain("details: stateBackend=ssh-pglite host=203.0.113.10 port=22");
    expect(output).toContain("exitCode=1");
    expect(output).toContain(
      "stderr=mkdir: cannot create directory '/var/lib/appaloft/runtime/state': No space left on device",
    );
    expect(output).toContain(
      "human-doc: /docs/observe/diagnostics/#runtime-target-capacity-inspect",
    );
    expect(output).toContain(
      "llm-guide: /docs/.well-known/appaloft/errors/infra_error.remote-state-resolution.json",
    );
    expect(output).toContain(
      "remedy: Inspect the SSH target capacity when remote state preparation reports no space or write failures.",
    );
  });

  test("prints SSH remote-state lock host and owner diagnostics", () => {
    const error: DomainError = {
      code: "infra_error",
      category: "infra",
      message: "SSH remote state mutation lock is already held",
      retryable: true,
      details: {
        phase: "remote-state-lock",
        stateBackend: "ssh-pglite",
        host: "203.0.113.10",
        port: "22",
        lockOwner: "appaloft-cli",
        correlationId: "remote_state_1",
        retryAfterSeconds: 1,
      },
    };

    const output = formatDomainError(error);

    expect(output).toContain("lock: stateBackend=ssh-pglite host=203.0.113.10 port=22");
    expect(output).toContain("lockOwner=appaloft-cli");
    expect(output).toContain("correlationId=remote_state_1");
  });
});
