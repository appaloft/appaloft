import { z } from "zod";

const dnsRecordRequirementSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(["A", "AAAA", "CNAME", "TXT"]),
    value: z.string().min(1),
    purpose: z
      .enum(["domain-routing", "domain-verification", "certificate-validation", "manual"])
      .default("domain-routing"),
    ttl: z.number().int().positive().optional(),
    proxied: z.boolean().optional(),
  })
  .strict();

export const inspectDomainBindingDnsReadinessQueryInputSchema = z
  .object({
    domainBindingId: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
    domainName: z.string().min(1).optional(),
    pathPrefix: z.string().min(1).default("/"),
    connectorKey: z.string().min(1).optional(),
    capabilityKey: z.enum(["dns.records.plan", "dns.records.apply"]).default("dns.records.apply"),
    records: z.array(dnsRecordRequirementSchema).optional(),
    ttl: z.number().int().positive().optional(),
    proxied: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.domainBindingId && (!value.resourceId || !value.domainName)) {
      context.addIssue({
        code: "custom",
        path: ["domainName"],
        message: "domainBindingId or resourceId + domainName is required",
      });
    }
  });

export type InspectDomainBindingDnsReadinessQueryInput = z.input<
  typeof inspectDomainBindingDnsReadinessQueryInputSchema
>;

export type InspectDomainBindingDnsReadinessQueryPayload = z.output<
  typeof inspectDomainBindingDnsReadinessQueryInputSchema
>;
