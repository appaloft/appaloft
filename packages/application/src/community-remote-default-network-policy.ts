export const COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY = {
  mode: "allowlist" as const,
  rules: [
    { kind: "domain" as const, value: "github.com", ports: [443] },
    { kind: "domain" as const, value: "api.github.com", ports: [443] },
    { kind: "domain" as const, value: "api.openai.com", ports: [443] },
    { kind: "domain" as const, value: "api.anthropic.com", ports: [443] },
    { kind: "domain" as const, value: "openrouter.ai", ports: [443] },
    { kind: "domain" as const, value: "api.deepseek.com", ports: [443] },
    { kind: "domain" as const, value: "api.x.ai", ports: [443] },
    { kind: "domain" as const, value: "opencode.ai", ports: [443] },
  ],
};
