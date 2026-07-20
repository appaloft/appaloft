export type QuickDeployGitHubSourceMode = "url" | "browser";

export function preferredQuickDeployGitHubSourceMode(input: {
  readonly currentMode: QuickDeployGitHubSourceMode;
  readonly modeTouched: boolean;
  readonly sourceLocator: string;
  readonly repositoryBrowsingEnabled: boolean;
}): QuickDeployGitHubSourceMode {
  if (
    input.currentMode === "url" &&
    !input.modeTouched &&
    !input.sourceLocator.trim() &&
    input.repositoryBrowsingEnabled
  ) {
    return "browser";
  }

  return input.currentMode;
}
