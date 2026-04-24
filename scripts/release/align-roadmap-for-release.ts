import { resolve } from "node:path";

import { booleanArg, parseCliArgs, stringArg } from "./lib/release-utils";
import { normalizeReleaseVersion, releaseTagName } from "./lib/targets";

interface PackageJson {
  version?: string;
}

interface ReleasePleaseManifest {
  ".": string;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
}

interface PhaseSection {
  number: number;
  title: string;
  target?: string;
  lines: string[];
}

const roadmapPath = resolve("docs/PRODUCT_ROADMAP.md");
const rootPackagePath = resolve("package.json");
const releasePleaseManifestPath = resolve(".github/.release-please-manifest.json");

function parseSemver(version: string): Semver {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(normalizeReleaseVersion(version));
  if (!match) {
    throw new Error(`Expected a stable SemVer version, received "${version}".`);
  }

  const [, major = "", minor = "", patch = ""] = match;
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
  };
}

function compareSemver(left: string, right: string): number {
  const parsedLeft = parseSemver(left);
  const parsedRight = parseSemver(right);

  for (const key of ["major", "minor", "patch"] as const) {
    const delta = parsedLeft[key] - parsedRight[key];
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

function parsePhases(roadmap: string): PhaseSection[] {
  const lines = roadmap.split("\n");
  const phaseStarts: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (/^## Phase \d+:/u.test(lines[index] ?? "")) {
      phaseStarts.push(index);
    }
  }

  return phaseStarts.map((startIndex, index): PhaseSection => {
    const endIndex = phaseStarts[index + 1] ?? lines.length;
    const sectionLines = lines.slice(startIndex, endIndex);
    const heading = sectionLines[0] ?? "";
    const headingMatch = /^## Phase (?<number>\d+): (?<title>.+)$/u.exec(heading);
    const phaseNumber = headingMatch?.groups?.number;
    const phaseTitle = headingMatch?.groups?.title;
    if (!phaseNumber || !phaseTitle) {
      throw new Error(`Cannot parse roadmap phase heading "${heading}".`);
    }

    const targetLine = sectionLines.find((line) => line.startsWith("Target: "));
    const targetMatch = targetLine ? /Target: `(?<target>[^`]+)`\./u.exec(targetLine) : undefined;

    return {
      number: Number.parseInt(phaseNumber, 10),
      title: phaseTitle,
      ...(targetMatch?.groups?.target ? { target: targetMatch.groups.target } : {}),
      lines: sectionLines,
    };
  });
}

function isSectionHeading(line: string): boolean {
  return /^[A-Z][A-Za-z0-9 `./+,-]+:$/u.test(line.trim());
}

function uncheckedItemsInSubsection(phase: PhaseSection, subsection: string): string[] {
  const startIndex = phase.lines.findIndex((line) => line.trim() === subsection);
  if (startIndex < 0) {
    return [];
  }

  const unchecked: string[] = [];
  for (let index = startIndex + 1; index < phase.lines.length; index += 1) {
    const line = phase.lines[index] ?? "";
    if (index > startIndex + 1 && isSectionHeading(line)) {
      break;
    }
    if (line.startsWith("- [ ] ")) {
      unchecked.push(line.slice("- [ ] ".length));
    }
  }

  return unchecked;
}

function findTargetPhase(phases: readonly PhaseSection[], targetVersion: string): PhaseSection {
  const exact = phases.find((phase) => phase.target === targetVersion);
  if (exact) {
    return exact;
  }

  const target = parseSemver(targetVersion);
  const sameMinorPhases = phases
    .filter((phase): phase is PhaseSection & { target: string } => {
      if (!phase.target || !/^\d+\.\d+\.\d+$/u.test(phase.target)) {
        return false;
      }
      const phaseTarget = parseSemver(phase.target);
      return phaseTarget.major === target.major && phaseTarget.minor === target.minor;
    })
    .sort((left, right) => compareSemver(left.target, right.target));

  const currentMinorPhase = sameMinorPhases.at(-1);
  if (currentMinorPhase && target.patch > parseSemver(currentMinorPhase.target).patch) {
    return currentMinorPhase;
  }

  throw new Error(`No roadmap phase target matches release ${targetVersion}.`);
}

function validateRoadmapGate(phases: readonly PhaseSection[], targetPhase: PhaseSection): void {
  const failingItems: string[] = [];
  for (const phase of phases.filter((candidate) => candidate.number <= targetPhase.number)) {
    for (const subsection of ["Release rule:", "Required:", "Exit criteria:"]) {
      const unchecked = uncheckedItemsInSubsection(phase, subsection);
      for (const item of unchecked) {
        failingItems.push(`Phase ${phase.number} ${subsection} ${item}`);
      }
    }
  }

  if (failingItems.length > 0) {
    throw new Error(
      [
        `Roadmap gate rejects release ${targetPhase.target ?? targetPhase.title}.`,
        ...failingItems.map((item) => `- ${item}`),
      ].join("\n"),
    );
  }
}

function parseAlignmentBullets(block: string): string[] {
  const lines = block.split("\n");
  const bullets: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("- [x] ") || line.startsWith("- [ ] ")) {
      if (current.length > 0) {
        bullets.push(current.join("\n").trimEnd());
      }
      current = [line];
      continue;
    }
    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    bullets.push(current.join("\n").trimEnd());
  }

  return bullets.filter((bullet) => bullet.length > 0);
}

function keepHistoricalAlignmentBullet(bullet: string): boolean {
  if (bullet.includes("latest public release") && bullet.includes("open Release Please PR")) {
    return false;
  }
  if (bullet.includes("next allowed stable target is")) {
    return false;
  }
  if (bullet.includes("roadmap gate allows") && bullet.includes("Release-As:")) {
    return false;
  }
  if (bullet.includes("root package and Release Please manifest on `main`")) {
    return false;
  }
  return true;
}

function phaseRangeLabel(targetPhase: PhaseSection): string {
  if (targetPhase.number === 0) {
    return "Phase 0";
  }
  return `Phase 0 through Phase ${targetPhase.number}`;
}

function updateReleaseAlignment(input: {
  roadmap: string;
  targetVersion: string;
  currentVersion: string;
  latestReleaseTag: string;
  date: string;
  targetPhase: PhaseSection;
}): string {
  const sectionStart = input.roadmap.indexOf("Current release alignment:\n");
  const nextSectionStart = input.roadmap.indexOf("\n## Source-Of-Truth Inputs", sectionStart);
  if (sectionStart < 0 || nextSectionStart < 0) {
    throw new Error("Cannot find the Current release alignment section.");
  }

  const prefix = input.roadmap.slice(0, sectionStart);
  const section = input.roadmap.slice(sectionStart, nextSectionStart);
  const suffix = input.roadmap.slice(nextSectionStart);

  const markerStart = "<!-- release-alignment:start -->";
  const markerEnd = "<!-- release-alignment:end -->";
  const markerStartIndex = section.indexOf(markerStart);
  const markerEndIndex = section.indexOf(markerEnd);

  const generatedLines = [
    markerStart,
    `- [x] On ${input.date}, the latest public release is \`${input.latestReleaseTag}\`; root package`,
    `  and Release Please manifest on \`main\` are \`${input.currentVersion}\`; the release PR target is`,
    `  \`${input.targetVersion}\`.`,
    `- [x] On ${input.date}, the roadmap gate allows \`Release-As: ${input.targetVersion}\` because`,
    `  ${phaseRangeLabel(input.targetPhase)} release rules, required items, and exit criteria are checked.`,
    markerEnd,
  ];
  const generatedBlock = generatedLines.join("\n");

  if (markerStartIndex >= 0 && markerEndIndex > markerStartIndex) {
    const replacementEnd = markerEndIndex + markerEnd.length;
    return `${prefix}${section.slice(0, markerStartIndex)}${generatedBlock}${section.slice(replacementEnd)}${suffix}`;
  }

  const body = section.slice("Current release alignment:\n".length).trim();
  const historicalBullets = parseAlignmentBullets(body).filter(keepHistoricalAlignmentBullet);
  const historicalBlock =
    historicalBullets.length > 0
      ? ["", "Historical alignment notes:", "", ...historicalBullets, ""].join("\n")
      : "\n";

  const updatedSection = `Current release alignment:\n\n${generatedBlock}\n${historicalBlock}`;
  return `${prefix}${updatedSection}${suffix}`;
}

const args = parseCliArgs(Bun.argv.slice(2));
const checkOnly = booleanArg(args, "check");
const rootPackage = await readJson<PackageJson>(rootPackagePath);
const releasePleaseManifest = await readJson<ReleasePleaseManifest>(releasePleaseManifestPath);
const targetVersion = normalizeReleaseVersion(
  stringArg(args, "target-version") ?? rootPackage.version ?? "",
);
const currentVersion = normalizeReleaseVersion(
  stringArg(args, "current-version") ??
    process.env.APPALOFT_CURRENT_VERSION ??
    releasePleaseManifest["."],
);
const latestReleaseTag =
  stringArg(args, "latest-release-tag") ??
  process.env.APPALOFT_LATEST_RELEASE_TAG ??
  releaseTagName(currentVersion);
const date = stringArg(args, "date") ?? new Date().toISOString().slice(0, 10);

if (!targetVersion) {
  throw new Error("Cannot determine target version. Pass --target-version or update package.json.");
}

if (compareSemver(targetVersion, currentVersion) <= 0) {
  throw new Error(
    `Release target ${targetVersion} must be greater than current version ${currentVersion}.`,
  );
}

const roadmap = await Bun.file(roadmapPath).text();
const phases = parsePhases(roadmap);
const targetPhase = findTargetPhase(phases, targetVersion);
validateRoadmapGate(phases, targetPhase);

const updated = updateReleaseAlignment({
  roadmap,
  targetVersion,
  currentVersion,
  latestReleaseTag,
  date,
  targetPhase,
});

if (checkOnly) {
  console.log(`docs/PRODUCT_ROADMAP.md release alignment is valid for ${targetVersion}`);
} else if (updated !== roadmap) {
  await Bun.write(roadmapPath, updated);
  console.log(`docs/PRODUCT_ROADMAP.md aligned for ${targetVersion}`);
} else {
  console.log(`docs/PRODUCT_ROADMAP.md already aligned for ${targetVersion}`);
}
