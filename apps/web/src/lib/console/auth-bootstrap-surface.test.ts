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
    const forgotPasswordPageSource = await readFile(
      new URL("../../routes/forgot-password/+page.svelte", import.meta.url),
      "utf8",
    );
    const resetPasswordPageSource = await readFile(
      new URL("../../routes/reset-password/+page.svelte", import.meta.url),
      "utf8",
    );
    const authPublicConfigSource = await readFile(
      new URL("../../lib/auth-public-config.ts", import.meta.url),
      "utf8",
    );
    const appHtmlSource = await readFile(new URL("../../app.html", import.meta.url), "utf8");
    const i18nSource = await readFile(new URL("../../lib/i18n.ts", import.meta.url), "utf8");
    const accountSecurityPageSource = await readFile(
      new URL("../../routes/account/security/+page.svelte", import.meta.url),
      "utf8",
    );
    const consoleShellSource = await readFile(
      new URL("../../lib/components/console/ConsoleShell.svelte", import.meta.url),
      "utf8",
    );
    const consoleOrganizationSwitcherSource = await readFile(
      new URL("../../lib/components/console/ConsoleOrganizationSwitcher.svelte", import.meta.url),
      "utf8",
    );
    const consoleUserMenuSource = await readFile(
      new URL("../../lib/components/console/ConsoleUserMenu.svelte", import.meta.url),
      "utf8",
    );

    expect(loginPageSource).not.toContain("/bootstrap/auth/first-admin");
    expect(loginPageSource).not.toContain("createAdmin");
    expect(loginPageSource).toContain("/api/auth/session");
    expect(loginPageSource).toContain("$lib/auth-public-config");
    expect(loginPageSource).toContain("isPublicGitHubAuthConfigured()");
    expect(loginPageSource).not.toContain("authSessionQuery.data?.providers");
    expect(loginPageSource).toContain("signInWithGithub");
    expect(loginPageSource).toContain("/forgot-password");
    expect(loginPageSource).toContain("authAccountRecovery.forgotLink");
    expect(signupPageSource).not.toContain("/bootstrap/auth/first-admin");
    expect(signupPageSource).toContain("/api/auth/session");
    expect(signupPageSource).toContain("$lib/auth-public-config");
    expect(signupPageSource).toContain("isPublicGitHubAuthConfigured()");
    expect(signupPageSource).not.toContain("authSessionQuery.data?.providers");
    expect(signupPageSource).toContain("signUpWithGithub");
    expect(signupPageSource).toContain("/api/auth/sign-up/email");
    expect(signupPageSource).toContain("/api/auth/organization/create");
    expect(signupPageSource).toContain("emailVerification.required");
    expect(signupPageSource).toContain("appaloftPendingVerificationIntent");
    expect(signupPageSource).not.toContain("appaloft.pending-email-verification");
    expect(loginPageSource).toContain("emailVerification.required");
    expect(loginPageSource).toContain("EMAIL_NOT_VERIFIED");
    expect(loginPageSource).toContain("appaloft.email-verification-resend-at");
    expect(loginPageSource).not.toContain("/email.*verif/i");
    expect(verifyEmailPageSource).toContain("/api/auth/email-otp/send-verification-otp");
    expect(verifyEmailPageSource).toContain("/api/auth/email-otp/verify-email");
    expect(verifyEmailPageSource).not.toContain("/api/auth/organization/create");
    expect(verifyEmailPageSource).not.toContain("appaloft.pending-email-verification");
    expect(verifyEmailPageSource).toContain("$lib/components/ui/input-otp");
    expect(verifyEmailPageSource).toContain("InputOTP.Root");
    expect(verifyEmailPageSource).toContain("REGEXP_ONLY_DIGITS");
    expect(verifyEmailPageSource).toContain("cooldownSeconds");
    expect(verifyEmailPageSource).toContain("requestCoolingDown");
    expect(forgotPasswordPageSource).toContain("/api/auth/session");
    expect(forgotPasswordPageSource).toContain("accountRecovery");
    expect(forgotPasswordPageSource).toContain("request-password-reset");
    expect(forgotPasswordPageSource).toContain("appaloft.account-recovery-request-at");
    expect(forgotPasswordPageSource).toContain("authAccountRecovery.requestCoolingDown");
    expect(resetPasswordPageSource).toContain("/api/auth/session");
    expect(resetPasswordPageSource).toContain("accountRecovery");
    expect(resetPasswordPageSource).toContain("reset-password");
    expect(resetPasswordPageSource).toContain("newPassword");
    expect(accountSecurityPageSource).toContain("/api/auth/change-password");
    expect(accountSecurityPageSource).toContain("/api/auth/set-password");
    expect(accountSecurityPageSource).toContain("/api/auth/email-otp/request-email-change");
    expect(accountSecurityPageSource).toContain("/api/auth/email-otp/change-email");
    expect(accountSecurityPageSource).toContain("accountSecurity");
    expect(accountSecurityPageSource).toContain("passwordState");
    expect(accountSecurityPageSource).toContain("appaloft.email-change-request-at");
    expect(accountSecurityPageSource).toContain("$lib/components/ui/input-otp");
    expect(accountSecurityPageSource).toContain("SettingsShell");
    expect(accountSecurityPageSource).toContain("accountSettingsItems");
    expect(accountSecurityPageSource).toContain('page.url.searchParams.get("section")');
    expect(accountSecurityPageSource).toContain("selectAccountSecuritySection");
    expect(accountSecurityPageSource).not.toContain("ConsoleShell");
    expect(accountSecurityPageSource).not.toContain("ConsoleResourceCanvas");
    expect(accountSecurityPageSource).not.toContain("ManagementShell");
    expect(consoleShellSource).toContain("ConsoleOrganizationSwitcher");
    expect(consoleOrganizationSwitcherSource).toContain("min-w-64");
    expect(consoleOrganizationSwitcherSource).not.toContain(
      "w-(--bits-dropdown-menu-anchor-width) min-w-0",
    );
    expect(consoleUserMenuSource).toContain("min-w-64");
    expect(consoleUserMenuSource).not.toContain("w-(--bits-dropdown-menu-anchor-width) min-w-0");
    expect(consoleUserMenuSource).toContain("/account/profile");
    expect(consoleUserMenuSource).toContain("accountSettings.introTitle");
    expect(consoleShellSource).not.toContain('navigateTo("/account/security")');
    expect(firstAdminPageSource).toContain("status?.bootstrapRequired === false");
    expect(firstAdminPageSource).toContain("goto(loginUrl)");
    expect(authPublicConfigSource).toContain("__APPALOFT_PUBLIC_CONFIG__");
    expect(authPublicConfigSource).toContain("VITE_APPALOFT_GITHUB_AUTH_ENABLED");
    expect(authPublicConfigSource).toContain("isPublicGitHubAuthConfigured");
    expect(appHtmlSource).toContain("/api/auth/public-config.js");
    expect(appHtmlSource).toContain('<html lang="en-US">');
    expect(i18nSource).toContain(
      "window.localStorage.getItem(appaloftLocaleStorageKey) || readDocumentLocale()",
    );
    expect(i18nSource).toContain("const initialLocale = readInitialLocale();");
    expect(i18nSource).toContain("syncDocumentLocale(initialLocale);");
  });

  test("[PRODUCT-AUTH-PUBLIC-CONFIG-001] auth entry pages render provider affordances from public runtime config", async () => {
    const [loginPageSource, signupPageSource, authPublicConfigSource] = await Promise.all([
      readFile(new URL("../../routes/login/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/sign-up/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../lib/auth-public-config.ts", import.meta.url), "utf8"),
    ]);

    expect(loginPageSource).toContain("const githubConfigured = isPublicGitHubAuthConfigured();");
    expect(signupPageSource).toContain("const githubConfigured = isPublicGitHubAuthConfigured();");
    expect(loginPageSource).not.toContain(
      'providers.find((provider) => provider.key === "github")',
    );
    expect(signupPageSource).not.toContain(
      'providers.find((provider) => provider.key === "github")',
    );
    expect(authPublicConfigSource).toContain("window.__APPALOFT_PUBLIC_CONFIG__?.auth");
    expect(authPublicConfigSource).toContain("configured: githubConfigured");
  });
});
