import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { CODING_AGENT_ENV_KEYS } from "../src/coding-agent-environment.js";

// GitHub Actions and coding-agent hosts leak CI=/CURSOR_AGENT= into bun test.
// Product-CLI unit tests that want the mutation guard pass a dedicated env object.
delete process.env.CI;
for (const key of CODING_AGENT_ENV_KEYS) {
  delete process.env[key];
}
