import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const sourceSkillRoot = resolve(repositoryRoot, "skills/appaloft");
const packagedSkillRoot = resolve(repositoryRoot, "plugins/appaloft/skills/appaloft");

await rm(packagedSkillRoot, { force: true, recursive: true });
await mkdir(packagedSkillRoot, { recursive: true });
await cp(resolve(sourceSkillRoot, "SKILL.md"), resolve(packagedSkillRoot, "SKILL.md"));
await cp(resolve(sourceSkillRoot, "references"), resolve(packagedSkillRoot, "references"), {
  recursive: true,
});
