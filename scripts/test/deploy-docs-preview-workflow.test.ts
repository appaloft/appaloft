import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(import.meta.dir, "../../.github/workflows/deploy-docs-preview.yml"),
  "utf8",
);
const githubExpressionOpen = "$" + "{{";
const shellVariableOpen = "$" + "{";

test("[PUB-DOCS-004] deploy-docs-preview reports a passing no-op preview for non-docs changes", () => {
  expect(workflow).toContain("name: Deploy Docs Preview");
  expect(workflow).toContain(
    `echo "docs_preview_required=${shellVariableOpen}docs_preview_required}"`,
  );
  expect(workflow).toContain("- name: Skip Docs Preview");
  expect(workflow).toContain("Docs preview is not required for this change set.");
  expect(workflow).toContain(
    `if: ${githubExpressionOpen} github.event.action != 'closed' && github.event.pull_request.head.repo.full_name == github.repository && !startsWith(github.event.pull_request.head.ref, 'release-please--') }}`,
  );
  expect(workflow).toContain(
    `if: ${githubExpressionOpen} needs.changes.outputs.docs_preview_required != 'true' }}`,
  );
  expect(workflow).toContain(
    `if: ${githubExpressionOpen} needs.changes.outputs.docs_preview_required == 'true' }}\n        uses: actions/checkout@v4`,
  );
  expect(workflow).toContain(
    `if: ${githubExpressionOpen} needs.changes.outputs.docs_preview_required == 'true' }}\n        id: deploy`,
  );
  expect(workflow).not.toContain(
    "needs.changes.outputs.docs_preview_required == 'true' && github.event.pull_request.head.repo.full_name",
  );
});
