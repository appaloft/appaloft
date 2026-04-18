export const sourceCommitShaMetadataKey = "source.commitSha";

const gitObjectIdPattern = /^[a-f0-9]{40,64}$/i;

export function parseResolvedGitCommitSha(output: string): string | undefined {
  const value = output.trim().split(/\s+/)[0];
  if (!value || !gitObjectIdPattern.test(value)) {
    return undefined;
  }

  return value.toLowerCase();
}

export function shortGitCommitSha(commitSha: string): string {
  return commitSha.slice(0, 12);
}
