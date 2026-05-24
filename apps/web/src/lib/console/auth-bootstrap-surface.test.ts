import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("self-hosted auth bootstrap Web surfaces", () => {
  test("[FIRST-ADMIN-BOOTSTRAP-007] login stays an ordinary account surface after setup", async () => {
    const loginPageSource = await readFile(
      new URL("../../routes/login/+page.svelte", import.meta.url),
      "utf8",
    );
    const signupPageSource = await readFile(
      new URL("../../routes/sign-up/+page.svelte", import.meta.url),
      "utf8",
    );
    const firstAdminPageSource = await readFile(
      new URL("../../routes/bootstrap/auth/first-admin/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(loginPageSource).not.toContain("/bootstrap/auth/first-admin");
    expect(loginPageSource).not.toContain("createAdmin");
    expect(signupPageSource).not.toContain("/bootstrap/auth/first-admin");
    expect(signupPageSource).toContain("/api/auth/sign-up/email");
    expect(signupPageSource).toContain("/api/auth/organization/create");
    expect(firstAdminPageSource).toContain("status?.bootstrapRequired === false");
    expect(firstAdminPageSource).toContain("goto(loginUrl)");
  });
});
