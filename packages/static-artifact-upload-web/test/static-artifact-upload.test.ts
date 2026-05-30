import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("Static artifact upload web component", () => {
  test("[CLOUD-WWW-STATIC-HERO-002][CLOUD-WWW-STATIC-HERO-004][CLOUD-WWW-STATIC-HERO-005] keeps upload UI neutral and adapter-driven", async () => {
    const [component, types, packageJson] = await Promise.all([
      readFile(new URL("../src/StaticArtifactUploadPanel.svelte", import.meta.url), "utf8"),
      readFile(new URL("../src/types.ts", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);

    expect(packageJson).toContain('"@appaloft/static-artifact-upload-web"');
    expect(packageJson).toContain('"@appaloft/ui"');
    expect(packageJson).not.toContain("@appaloft-cloud/");
    expect(types).toContain("StaticArtifactUploadAdapter");
    expect(types).toContain("readonly copy: StaticArtifactUploadCopy");
    expect(types).toContain('"minimal"');
    expect(types).toContain("checkSession()");
    expect(types).toContain("requestLogin");
    expect(types).toContain("publish(input: StaticArtifactUploadPublishInput)");
    expect(types).toContain('provider: StaticArtifactUploadAuthProvider["key"]');
    expect(types).not.toContain("copy?: Partial");
    expect(types).not.toContain("@appaloft-cloud/");
    expect(component).toContain("@appaloft/ui/card");
    expect(component).toContain("@appaloft/ui/dialog");
    expect(component).toContain("@appaloft/ui/button");
    expect(component).toContain("@appaloft/ui/input");
    expect(component).toContain("@appaloft/ui/badge");
    expect(component).toContain("@lucide/svelte/icons/upload-cloud");
    expect(component).toContain('viewBox="0 0 24 24"');
    expect(component).toContain("data-static-artifact-upload-panel");
    expect(component).toContain("DialogContent");
    expect(component).toContain("githubProvider?.available");
    expect(component).toContain("emailProvider?.available");
    expect(component).toContain("adapter.checkSession()");
    expect(component).toContain("ensureAuthenticatedForFileSelection");
    expect(component).toContain("isMinimal");
    expect(component).toContain("handleUploadSurfaceClick");
    expect(component).toContain("async function openFilePicker");
    expect(component).toContain("if (!(await ensureAuthenticatedForFileSelection())) return;");
    expect(component).toContain("adapter.requestLogin(request)");
    expect(component).toContain("adapter.publish({");
    expect(component).toContain("onProgress(nextProgress)");
    expect(component).toContain("data-static-artifact-upload-result");
    expect(component).toContain("<progress");
    expect(component).not.toContain("<style");
    expect(component).not.toContain("style=");
    expect(component).not.toContain("[#");
    expect(component).not.toContain("rgba(");
    expect(component).not.toContain("linear-gradient");
    expect(component).not.toContain("shadow-[");
    expect(component).not.toContain("bg-[");
    expect(component).not.toContain("border-[");
    expect(component).not.toContain("text-[");
    expect(component).not.toContain("ring-[");
    expect(component).not.toContain("accent-[");
    expect(component).not.toContain("const defaultCopy");
    expect(component).not.toContain("静态文件");
    expect(component).not.toContain("Choose files");
    expect(component).not.toContain("@appaloft-cloud/");
    expect(component).not.toContain("/cloud/static-artifacts");
  });
});
