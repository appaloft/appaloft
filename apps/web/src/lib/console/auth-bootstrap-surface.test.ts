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
    const verifyEmailPageSource = await readFile(
      new URL("../../routes/verify-email/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(loginPageSource).not.toContain("/bootstrap/auth/first-admin");
    expect(loginPageSource).not.toContain("createAdmin");
    expect(loginPageSource).toContain("/api/auth/session");
    expect(loginPageSource).toContain("signInWithGithub");
    expect(signupPageSource).not.toContain("/bootstrap/auth/first-admin");
    expect(signupPageSource).toContain("/api/auth/session");
    expect(signupPageSource).toContain("signUpWithGithub");
    expect(signupPageSource).toContain("/api/auth/sign-up/email");
    expect(signupPageSource).toContain("/api/auth/organization/create");
    expect(signupPageSource).toContain("emailVerification.required");
    expect(signupPageSource).toContain("appaloft.pending-email-verification");
    expect(loginPageSource).toContain("emailVerification.required");
    expect(verifyEmailPageSource).toContain("/api/auth/email-otp/send-verification-otp");
    expect(verifyEmailPageSource).toContain("/api/auth/email-otp/verify-email");
    expect(verifyEmailPageSource).toContain("/api/auth/organization/create");
    expect(firstAdminPageSource).toContain("status?.bootstrapRequired === false");
    expect(firstAdminPageSource).toContain("goto(loginUrl)");
  });
});
