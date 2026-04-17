import { CreateProjectCommand, ListProjectsQuery } from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

const nameOption = Options.text("name");
const descriptionOption = Options.text("description").pipe(Options.optional);

const createCommand = EffectCommand.make(
  "create",
  {
    name: nameOption,
    description: descriptionOption,
  },
  ({ description, name }) =>
    runCommand(
      CreateProjectCommand.create({
        name,
        description: optionalValue(description),
      }),
    ),
).pipe(EffectCommand.withDescription("Create a project"));

const listCommand = EffectCommand.make("list", {}, () => runQuery(ListProjectsQuery.create())).pipe(
  EffectCommand.withDescription("List projects"),
);

export const projectCommand = EffectCommand.make("project").pipe(
  EffectCommand.withDescription("Project operations"),
  EffectCommand.withSubcommands([createCommand, listCommand]),
);
