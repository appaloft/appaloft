import { z } from "zod";

const domainBindingDnsCapabilitySchema = z
  .enum(["dns.records.plan", "dns.domain-connect.start"])
  .default("dns.records.plan");

const dnsRecordTypeSchema = z.enum(["A", "AAAA", "CNAME", "TXT"]);

export const planDomainBindingDnsQueryInputSchema = z.object({
  domainBindingId: z.string().min(1),
  connectorKey: z.string().min(1).default("cloudflare-dns"),
  capabilityKey: domainBindingDnsCapabilitySchema,
  zoneName: z.string().min(1).optional(),
  recordType: dnsRecordTypeSchema.optional(),
  ttl: z.number().int().positive().optional(),
  proxied: z.boolean().optional(),
});

export type PlanDomainBindingDnsQueryInput = z.input<typeof planDomainBindingDnsQueryInputSchema>;

export type PlanDomainBindingDnsQueryPayload = z.output<
  typeof planDomainBindingDnsQueryInputSchema
>;
