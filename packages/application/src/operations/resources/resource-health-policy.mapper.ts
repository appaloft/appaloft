import {
  err,
  HealthCheckExpectedStatusCode,
  HealthCheckHostText,
  HealthCheckHttpMethodValue,
  HealthCheckIntervalSeconds,
  HealthCheckPathText,
  HealthCheckResponseText,
  HealthCheckRetryCount,
  HealthCheckSchemeValue,
  HealthCheckStartPeriodSeconds,
  HealthCheckTimeoutSeconds,
  HealthCheckTypeValue,
  ok,
  PortNumber,
  type ResourceHealthCheckPolicyState,
  type Result,
} from "@appaloft/core";

import { type ResourceHealthCheckPolicyCommandInput } from "./create-resource.schema";

export function resourceHealthCheckPolicyFromInput(
  input: ResourceHealthCheckPolicyCommandInput,
): Result<ResourceHealthCheckPolicyState> {
  const type = HealthCheckTypeValue.create(input.type ?? "http");
  if (type.isErr()) return err(type.error);
  const intervalSeconds = HealthCheckIntervalSeconds.create(input.intervalSeconds ?? 5);
  if (intervalSeconds.isErr()) return err(intervalSeconds.error);
  const timeoutSeconds = HealthCheckTimeoutSeconds.create(input.timeoutSeconds ?? 5);
  if (timeoutSeconds.isErr()) return err(timeoutSeconds.error);
  const retries = HealthCheckRetryCount.create(input.retries ?? 10);
  if (retries.isErr()) return err(retries.error);
  const startPeriodSeconds = HealthCheckStartPeriodSeconds.create(input.startPeriodSeconds ?? 5);
  if (startPeriodSeconds.isErr()) return err(startPeriodSeconds.error);

  const httpInput = input.http;
  if (!httpInput) {
    return ok({
      enabled: input.enabled ?? true,
      type: type.value,
      intervalSeconds: intervalSeconds.value,
      timeoutSeconds: timeoutSeconds.value,
      retries: retries.value,
      startPeriodSeconds: startPeriodSeconds.value,
    });
  }

  const method = HealthCheckHttpMethodValue.create(httpInput.method ?? "GET");
  if (method.isErr()) return err(method.error);
  const scheme = HealthCheckSchemeValue.create(httpInput.scheme ?? "http");
  if (scheme.isErr()) return err(scheme.error);
  const host = HealthCheckHostText.create(httpInput.host ?? "localhost");
  if (host.isErr()) return err(host.error);
  let portValue: PortNumber | undefined;
  if (httpInput.port) {
    const port = PortNumber.create(httpInput.port);
    if (port.isErr()) return err(port.error);
    portValue = port.value;
  }
  const path = HealthCheckPathText.create(httpInput.path ?? "/");
  if (path.isErr()) return err(path.error);
  const expectedStatusCode = HealthCheckExpectedStatusCode.create(
    httpInput.expectedStatusCode ?? 200,
  );
  if (expectedStatusCode.isErr()) return err(expectedStatusCode.error);
  let expectedResponseTextValue: HealthCheckResponseText | undefined;
  if (httpInput.expectedResponseText) {
    const expectedResponseText = HealthCheckResponseText.create(httpInput.expectedResponseText);
    if (expectedResponseText.isErr()) return err(expectedResponseText.error);
    expectedResponseTextValue = expectedResponseText.value;
  }

  return ok({
    enabled: input.enabled ?? true,
    type: type.value,
    intervalSeconds: intervalSeconds.value,
    timeoutSeconds: timeoutSeconds.value,
    retries: retries.value,
    startPeriodSeconds: startPeriodSeconds.value,
    http: {
      method: method.value,
      scheme: scheme.value,
      host: host.value,
      ...(portValue ? { port: portValue } : {}),
      path: path.value,
      expectedStatusCode: expectedStatusCode.value,
      ...(expectedResponseTextValue ? { expectedResponseText: expectedResponseTextValue } : {}),
    },
  });
}
