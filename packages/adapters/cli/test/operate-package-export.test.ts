import { expect, test } from "bun:test";

test("[OPR-PACKAGE-019] exposes the Operate presentation without loading the full CLI surface", async () => {
  const presentation = await import("@appaloft/adapter-cli/operate-presentation");

  expect(presentation.createOperateCoordinator).toBeFunction();
  expect(presentation.createBoundedOperatePresentation).toBeFunction();
});
