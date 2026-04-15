import { Args, Command as EffectCommand, Options } from "@effect/cli";
import {
  CreateResourceCommand,
  ListResourcesQuery,
  ResourceRuntimeLogsQuery,
} from "@yundu/application";
import { resourceKinds } from "@yundu/core";

import {
  optionalNumber,
  optionalValue,
  runCommand,
  runQuery,
  runResourceRuntimeLogsQuery,
} from "../runtime.js";

const resourceIdArg = Args.text({ name: "resourceId" });
const projectOption = Options.text("project").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const createProjectOption = Options.text("project");
const createEnvironmentOption = Options.text("environment");
const nameOption = Options.text("name");
const kindOption = Options.choice("kind", resourceKinds).pipe(Options.withDefault("application"));
const destinationOption = Options.text("destination").pipe(Options.optional);
const descriptionOption = Options.text("description").pipe(Options.optional);
const internalPortOption = Options.text("internal-port").pipe(Options.optional);
const portOption = Options.text("port").pipe(Options.optional);
const deploymentOption = Options.text("deployment").pipe(Options.optional);
const serviceOption = Options.text("service").pipe(Options.optional);
const tailOption = Options.text("tail").pipe(Options.withDefault("100"));
const followOption = Options.boolean("follow").pipe(Options.withDefault(false));

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
    internalPort: internalPortOption,
    port: portOption,
  },
  ({ description, destination, environment, internalPort, kind, name, port, project }) => {
    const internalPortValue = optionalNumber(internalPort) ?? optionalNumber(port);
    return runCommand(
      CreateResourceCommand.create({
        projectId: project,
        environmentId: environment,
        name,
        kind,
        destinationId: optionalValue(destination),
        description: optionalValue(description),
        ...(internalPortValue
          ? {
              networkProfile: {
                internalPort: internalPortValue,
                upstreamProtocol: "http",
                exposureMode: "reverse-proxy",
              },
            }
          : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription("Create a resource"));

const logsCommand = EffectCommand.make(
  "logs",
  {
    resourceId: resourceIdArg,
    deployment: deploymentOption,
    service: serviceOption,
    tail: tailOption,
    follow: followOption,
  },
  ({ deployment, follow, resourceId, service, tail }) =>
    runResourceRuntimeLogsQuery(
      ResourceRuntimeLogsQuery.create({
        resourceId,
        deploymentId: optionalValue(deployment),
        serviceName: optionalValue(service),
        tailLines: Number(tail),
        follow,
      }),
    ),
).pipe(EffectCommand.withDescription("Show resource runtime logs"));

export const resourceCommand = EffectCommand.make("resource").pipe(
  EffectCommand.withDescription("Resource operations"),
  EffectCommand.withSubcommands([createCommand, listCommand, logsCommand]),
);
