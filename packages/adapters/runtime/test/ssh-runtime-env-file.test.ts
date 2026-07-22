import { describe, expect, test } from "bun:test";

import {
  renderRemotePrivateTextFileCommand,
  renderRuntimeEnvironmentShellFile,
  withOptionalRemoteRuntimeEnvironmentFile,
  withRemoteRuntimeEnvironmentFile,
} from "../src/ssh-runtime-env-file";

describe("SSH runtime environment files", () => {
  test("[DEP-BIND-SECRET-RESOLVE-005] renders shell exports with safe quoting", () => {
    const contents = renderRuntimeEnvironmentShellFile({
      variables: [
        { name: "DATABASE_URL", value: "postgres://user:p'ass@example.test/db", redacted: true },
        { name: "APPALOFT_DEPLOYMENT_ID", value: "dep_123" },
        { name: "PORT", value: "3000" },
      ],
    });

    expect(contents).toContain("export APPALOFT_DEPLOYMENT_ID='dep_123'");
    expect(contents).toContain("export DATABASE_URL='postgres://user:p'\\''ass@example.test/db'");
    expect(contents).toContain("export PORT='3000'");
    expect(contents).toMatchSnapshot();
  });

  test("renders private remote write command and redacts encoded payload", () => {
    const contents = "export DATABASE_URL='postgres://secret'\n";
    const rendered = renderRemotePrivateTextFileCommand({
      path: "/srv/app/.appaloft/runtime.env",
      contents,
    });

    expect(rendered.command).toContain("chmod 600");
    expect(rendered.command).toContain("mv \"$tmp\" '/srv/app/.appaloft/runtime.env'");
    expect(rendered.redactions).toContain(contents);
    expect(rendered.redactions).toContain(Buffer.from(contents, "utf8").toString("base64"));
    expect(rendered.command).toMatchSnapshot();
  });

  test("wraps remote compose commands after loading the runtime environment file", () => {
    expect({
      required: withRemoteRuntimeEnvironmentFile({
        envFile: "/srv/app/.appaloft/runtime.env",
        command: "docker compose up -d",
      }),
      optional: withOptionalRemoteRuntimeEnvironmentFile({
        envFile: "/srv/app/.appaloft/runtime.env",
        command: "docker compose down",
      }),
    }).toMatchSnapshot();
    expect(
      withRemoteRuntimeEnvironmentFile({
        envFile: "/srv/app/.appaloft/runtime.env",
        command: "docker compose up -d",
      }),
    ).toBe("{ . '/srv/app/.appaloft/runtime.env'; } && {\ndocker compose up -d\n}");

    expect(
      withOptionalRemoteRuntimeEnvironmentFile({
        envFile: "/srv/app/.appaloft/runtime.env",
        command: "docker compose down",
      }),
    ).toBe(
      "{ if [ -f '/srv/app/.appaloft/runtime.env' ]; then . '/srv/app/.appaloft/runtime.env'; fi; } && {\ndocker compose down\n}",
    );
  });
});
