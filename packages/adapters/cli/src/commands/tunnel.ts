import {
  ListTunnelSessionsQuery,
  RevokeTunnelSessionCommand,
  ShowTunnelSessionQuery,
  StartTunnelCommand,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { runCommand, runQuery } from "../runtime.js";

const providerOption = Options.choice("provider", ["cloudflare-quick", "ngrok"]).pipe(
  Options.withDefault("cloudflare-quick"),
);
const originOption = Options.text("origin");
const durationMinutesOption = Options.integer("duration-minutes").pipe(Options.withDefault(60));
const statusOption = Options.choice("status", [
  "starting",
  "ready",
  "failed",
  "revoked",
  "expired",
]).pipe(Options.optional);
const sessionIdArg = Args.text({ name: "sessionId" });

const startCommand = EffectCommand.make(
  "start",
  { provider: providerOption, origin: originOption, durationMinutes: durationMinutesOption },
  ({ provider, origin, durationMinutes }) =>
    runCommand(
      StartTunnelCommand.create({
        providerKey: provider,
        originUrl: origin,
        durationMinutes,
      }),
    ),
).pipe(EffectCommand.withDescription("Start a temporary Cloudflare Quick Tunnel or ngrok session"));

const listCommand = EffectCommand.make("list", { status: statusOption }, ({ status }) =>
  runQuery(
    ListTunnelSessionsQuery.create({ status: status._tag === "Some" ? status.value : undefined }),
  ),
).pipe(EffectCommand.withDescription("List tunnel sessions and expiry status"));

const showCommand = EffectCommand.make("show", { sessionId: sessionIdArg }, ({ sessionId }) =>
  runQuery(ShowTunnelSessionQuery.create({ sessionId })),
).pipe(EffectCommand.withDescription("Show one tunnel session"));

const revokeCommand = EffectCommand.make("revoke", { sessionId: sessionIdArg }, ({ sessionId }) =>
  runCommand(RevokeTunnelSessionCommand.create({ sessionId })),
).pipe(EffectCommand.withDescription("Revoke a tunnel session idempotently"));

export const tunnelCommand = EffectCommand.make("tunnel").pipe(
  EffectCommand.withDescription("Manage temporary public tunnel sessions"),
  EffectCommand.withSubcommands([startCommand, listCommand, showCommand, revokeCommand]),
);
