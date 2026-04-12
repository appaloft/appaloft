import { Command as EffectCommand, Options } from "@effect/cli";
import { ListResourcesQuery } from "@yundu/application";

import { optionalValue, runQuery } from "../runtime.js";

const projectOption = Options.text("project").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);

const listCommand = EffectCommand.make(
  "list",
  {
    project: projectOption,
    environment: environmentOption,
  },
  ({ environment, project }) =>
    runQuery(
      ListResourcesQuery.create({
        projectId: optionalValue(project),
        environmentId: optionalValue(environment),
      }),
    ),
).pipe(EffectCommand.withDescription("List resources"));

export const resourceCommand = EffectCommand.make("resource").pipe(
  EffectCommand.withDescription("Resource operations"),
  EffectCommand.withSubcommands([listCommand]),
);
