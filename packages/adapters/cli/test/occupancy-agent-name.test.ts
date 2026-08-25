import { expect, test } from "bun:test";

import { occupancyAgentWakeLine, occupancyAgentWokeLine } from "../src/occupancy-agent-name.js";

test("[WS-AGENT-NAME-001] wake copy uses the persisted Agent name", () => {
  expect(occupancyAgentWakeLine("resonant-silence")).toBe("Waking agent resonant-silence");
  expect(occupancyAgentWokeLine("resonant-silence")).toBe(
    "Woke agent resonant-silence — your work is on its disk",
  );
});
