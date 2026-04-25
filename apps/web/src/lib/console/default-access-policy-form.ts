import {
  type ConfigureDefaultAccessDomainPolicyInput,
  type DefaultAccessDomainPolicyRead,
} from "@appaloft/contracts";

export interface DefaultAccessPolicyFormState {
  mode: ConfigureDefaultAccessDomainPolicyInput["mode"];
  providerKey: string;
  templateRef: string;
}

export const defaultDefaultAccessPolicyFormState = {
  mode: "provider",
  providerKey: "sslip",
  templateRef: "",
} satisfies DefaultAccessPolicyFormState;

export function toDefaultAccessPolicyFormState(
  policy: DefaultAccessDomainPolicyRead | null | undefined,
): DefaultAccessPolicyFormState {
  if (!policy) {
    return { ...defaultDefaultAccessPolicyFormState };
  }

  return {
    mode: policy.mode,
    providerKey: policy.providerKey ?? defaultDefaultAccessPolicyFormState.providerKey,
    templateRef: policy.templateRef ?? "",
  };
}
