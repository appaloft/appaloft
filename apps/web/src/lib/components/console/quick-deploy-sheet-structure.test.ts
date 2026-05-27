import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const quickDeploySheetSource = readFileSync(
  fileURLToPath(new URL("./QuickDeploySheet.svelte", import.meta.url)),
  "utf8",
);

describe("QuickDeploySheet structure", () => {
  test("[QUICK-DEPLOY-UX-001] keeps the lower quick deploy section scoped to variables", () => {
    expect(quickDeploySheetSource).toContain("data-quick-deploy-variables-section");
    expect(quickDeploySheetSource).toContain("<details");
    expect(quickDeploySheetSource).toContain("ontoggle={(event) =>");
    expect(quickDeploySheetSource).toContain("未配置变量");
    expect(quickDeploySheetSource).toContain("已配置 1 项");
    expect(quickDeploySheetSource).not.toContain("<span>部署配置</span>");
    expect(quickDeploySheetSource).not.toContain('{variableContextEnabled ? "跳过" : "编辑"}');
    expect(quickDeploySheetSource).not.toContain('return "跳过";');
    expect(quickDeploySheetSource).not.toContain('return "不创建变量";');
    expect(quickDeploySheetSource).not.toContain("resource-default-static-publish-directory");
    expect(quickDeploySheetSource).not.toContain("resource-default-internal-port");
    expect(quickDeploySheetSource).not.toContain("resource-default-health-path");
    expect(quickDeploySheetSource).not.toContain("deploymentCommandPreview");
    expect(quickDeploySheetSource).not.toContain("appaloft deploy");
  });

  test("[QUICK-DEPLOY-UX-002] docks the submit action inside the right summary panel", () => {
    expect(quickDeploySheetSource).toContain("data-quick-deploy-action-panel");
    expect(quickDeploySheetSource).not.toContain("fixed inset-x-0 bottom-0");
    expect(quickDeploySheetSource).not.toContain("min-h-16 w-full items-center justify-between");
    expect(quickDeploySheetSource).toContain('class="w-full"');
  });
});
