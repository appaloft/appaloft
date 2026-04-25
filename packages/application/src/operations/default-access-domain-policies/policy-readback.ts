import {
  type DefaultAccessDomainPolicyRead,
  type DefaultAccessDomainPolicyRecord,
} from "../../ports";

export function toDefaultAccessDomainPolicyRead(
  record: DefaultAccessDomainPolicyRecord,
): DefaultAccessDomainPolicyRead {
  return {
    schemaVersion: "default-access-domain-policies.policy/v1",
    id: record.id,
    scope: record.scope,
    mode: record.mode,
    updatedAt: record.updatedAt,
    ...(record.providerKey ? { providerKey: record.providerKey } : {}),
    ...(record.templateRef ? { templateRef: record.templateRef } : {}),
  };
}
