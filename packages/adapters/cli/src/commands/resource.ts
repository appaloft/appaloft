import { Command as EffectCommand, Options } from "@effect/cli";
import { CreateResourceCommand, ListResourcesQuery } from "@yundu/application";
import { resourceKinds } from "@yundu/core";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

const projectOption = Options.text("project").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const createProjectOption = Options.text("project");
const createEnvironmentOption = Options.text("environment");
const nameOption = Options.text("name");
const kindOption = Options.choice("kind", resourceKinds).pipe(Options.withDefault("application"));
const destinationOption = Options.text("destination").pipe(Options.optional);
const descriptionOption = Options.text("description").pipe(Options.optional);

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

const createCommand = EffectCommand.make(
  "create",
  {
    project: createProjectOption,
    environment: createEnvironmentOption,
    name: nameOption,
    kind: kindOption,
    destination: destinationOption,
    description: descriptionOption,
  },
  ({ description, destination, environment, kind, name, project }) =>
    runCommand(
      CreateResourceCommand.create({
        projectId: project,
        environmentId: environment,
        name,
        kind,
        destinationId: optionalValue(destination),
        description: optionalValue(description),
      }),
    ),
).pipe(EffectCommand.withDescription("Create a resource"));

export const resourceCommand = EffectCommand.make("resource").pipe(
  EffectCommand.withDescription("Resource operations"),
  EffectCommand.withSubcommands([createCommand, listCommand]),
);
