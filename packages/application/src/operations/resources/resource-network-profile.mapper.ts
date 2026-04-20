import {
  err,
  ok,
  PortNumber,
  ResourceExposureModeValue,
  type ResourceNetworkProfileState,
  ResourceNetworkProtocolValue,
  ResourceServiceName,
  type Result,
} from "@appaloft/core";
import { type z } from "zod";

import { type createResourceNetworkProfileInputSchema } from "./create-resource.schema";

type ResourceNetworkProfileMapperInput = z.input<typeof createResourceNetworkProfileInputSchema>;

export function resourceNetworkProfileFromInput(
  input: ResourceNetworkProfileMapperInput,
): Result<ResourceNetworkProfileState> {
  const internalPort = PortNumber.create(input.internalPort);
  if (internalPort.isErr()) return err(internalPort.error);
  const upstreamProtocol = ResourceNetworkProtocolValue.create(input.upstreamProtocol ?? "http");
  if (upstreamProtocol.isErr()) return err(upstreamProtocol.error);
  const exposureMode = ResourceExposureModeValue.create(input.exposureMode ?? "reverse-proxy");
  if (exposureMode.isErr()) return err(exposureMode.error);

  let targetServiceName: ResourceServiceName | undefined;
  if (input.targetServiceName) {
    const parsedTargetServiceName = ResourceServiceName.create(input.targetServiceName);
    if (parsedTargetServiceName.isErr()) return err(parsedTargetServiceName.error);
    targetServiceName = parsedTargetServiceName.value;
  }

  let hostPort: PortNumber | undefined;
  if (input.hostPort) {
    const parsedHostPort = PortNumber.create(input.hostPort);
    if (parsedHostPort.isErr()) return err(parsedHostPort.error);
    hostPort = parsedHostPort.value;
  }

  return ok({
    internalPort: internalPort.value,
    upstreamProtocol: upstreamProtocol.value,
    exposureMode: exposureMode.value,
    ...(targetServiceName ? { targetServiceName } : {}),
    ...(hostPort ? { hostPort } : {}),
  });
}
