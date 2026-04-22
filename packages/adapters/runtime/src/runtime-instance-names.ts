const dockerNameMaxLength = 63;
const composeProjectNameMaxLength = 63;

function sanitizeName(
  value: string,
  options: { allowDots: boolean; allowUnderscores: boolean },
): string {
  const invalidPattern = new RegExp(
    `[^a-z0-9${options.allowDots ? "." : ""}${options.allowUnderscores ? "_" : ""}-]`,
    "g",
  );

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(invalidPattern, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  return normalized.length > 0 ? normalized : "runtime";
}

function truncateName(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength).replace(/[._-]+$/g, "");
}

function deriveUniqueName(input: {
  baseName: string;
  suffix: string;
  maxLength: number;
  allowDots: boolean;
  allowUnderscores: boolean;
}): string {
  const sanitize = (value: string) =>
    sanitizeName(value, {
      allowDots: input.allowDots,
      allowUnderscores: input.allowUnderscores,
    });
  const normalizedSuffix = sanitize(input.suffix);
  const normalizedBase = sanitize(input.baseName);
  const separator = "-";
  const maxBaseLength = Math.max(1, input.maxLength - normalizedSuffix.length - separator.length);
  const truncatedBase = truncateName(normalizedBase, maxBaseLength);
  return truncateName(
    sanitize(`${truncatedBase}${separator}${normalizedSuffix}`),
    input.maxLength,
  );
}

export interface RuntimeInstanceNames {
  requestedRuntimeName?: string;
  containerName: string;
  imageName: string;
  composeProjectName: string;
}

export function deriveRuntimeInstanceNames(input: {
  deploymentId: string;
  metadata?: Record<string, string>;
}): RuntimeInstanceNames {
  const requestedRuntimeName = input.metadata?.["resource.runtimeName"]?.trim().toLowerCase();

  if (!requestedRuntimeName) {
    return {
      containerName: sanitizeName(`appaloft-${input.deploymentId}`, {
        allowDots: true,
        allowUnderscores: true,
      }),
      imageName: sanitizeName(`appaloft-image-${input.deploymentId}`, {
        allowDots: true,
        allowUnderscores: true,
      }),
      composeProjectName: sanitizeName(`appaloft-${input.deploymentId}`, {
        allowDots: false,
        allowUnderscores: true,
      }),
    };
  }

  return {
    requestedRuntimeName,
    containerName: deriveUniqueName({
      baseName: requestedRuntimeName,
      suffix: input.deploymentId,
      maxLength: dockerNameMaxLength,
      allowDots: true,
      allowUnderscores: true,
    }),
    imageName: deriveUniqueName({
      baseName: `${requestedRuntimeName}-image`,
      suffix: input.deploymentId,
      maxLength: dockerNameMaxLength,
      allowDots: true,
      allowUnderscores: true,
    }),
    composeProjectName: deriveUniqueName({
      baseName: requestedRuntimeName,
      suffix: input.deploymentId,
      maxLength: composeProjectNameMaxLength,
      allowDots: false,
      allowUnderscores: true,
    }),
  };
}
