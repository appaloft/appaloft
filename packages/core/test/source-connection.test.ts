import { describe, expect, test } from "bun:test";

import { ProviderAppTokenLease, SourceProviderKey, SourceRepositoryAccess } from "../src";

const NOW = "2026-07-20T00:30:00.000Z";
const FUTURE = "2026-07-20T01:00:00.000Z";
const PAST = "2026-07-20T00:00:00.000Z";

function createLease(input?: {
  expiresAt?: string;
  now?: string;
  permissions?: string[];
  repositoryFullNames?: string[];
  providerKey?: string;
  installationId?: string;
}) {
  return ProviderAppTokenLease.create({
    providerKey: input?.providerKey ?? "GitHub",
    installationId: input?.installationId ?? " inst_123 ",
    expiresAt: input?.expiresAt ?? FUTURE,
    permissions: input?.permissions ?? [" contents:read ", "metadata:read"],
    ...(input?.repositoryFullNames ? { repositoryFullNames: input.repositoryFullNames } : {}),
    now: input?.now ?? NOW,
  });
}

describe("SourceProviderKey", () => {
  test("[CORE-SRC-KEY-001] normalizes provider keys and rejects blanks", () => {
    expect(SourceProviderKey.create(" GitHub ")._unsafeUnwrap().value).toBe("github");
    expect(SourceProviderKey.create("   ").isErr()).toBe(true);
    expect(SourceProviderKey.create("")._unsafeUnwrapErr().message).toBe(
      "Source provider key is required",
    );
  });
});

describe("ProviderAppTokenLease", () => {
  test("[CORE-SRC-LEASE-001] creates an unexpired redacted lease", () => {
    const lease = createLease()._unsafeUnwrap();

    expect(lease.isExpired()).toBe(false);
    expect(lease.toJSON()).toEqual({
      providerKey: "github",
      installationId: "inst_123",
      expiresAt: new Date(FUTURE).toISOString(),
      redacted: true,
      expired: false,
      permissions: ["contents:read", "metadata:read"],
    });
  });

  test("[CORE-SRC-LEASE-002] treats expiresAt equal to now as expired", () => {
    const lease = createLease({ expiresAt: NOW, now: NOW })._unsafeUnwrap();
    expect(lease.isExpired()).toBe(true);
    expect(lease.toJSON().expired).toBe(true);
  });

  test("[CORE-SRC-LEASE-003] rejects empty permissions", () => {
    const lease = createLease({ permissions: ["  ", ""] });
    expect(lease.isErr()).toBe(true);
    expect(lease._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      message: "Provider app token permissions are required",
    });
  });

  test("[CORE-SRC-LEASE-004] rejects invalid expiry timestamps", () => {
    const lease = createLease({ expiresAt: "not-a-date" });
    expect(lease.isErr()).toBe(true);
    expect(lease._unsafeUnwrapErr().message).toBe(
      "Provider app token expiry must be an ISO timestamp",
    );
  });

  test("[CORE-SRC-LEASE-005] rejects blank installation ids and invalid now values", () => {
    expect(createLease({ installationId: "  " }).isErr()).toBe(true);
    expect(createLease({ now: "bad-now" })._unsafeUnwrapErr().message).toBe(
      "Provider app token comparison time must be valid",
    );
  });

  test("[CORE-SRC-LEASE-006] narrows permissions and repositories by intersection", () => {
    const lease = createLease({
      permissions: ["contents:read", "metadata:read", "issues:write"],
      repositoryFullNames: ["acme/app", "acme/docs", "acme/ops"],
    })._unsafeUnwrap();

    const narrowed = lease
      .narrow({
        permissions: ["metadata:read", "administration:write"],
        repositoryFullNames: ["acme/docs", "acme/missing"],
        now: NOW,
      })
      ._unsafeUnwrap();

    expect(narrowed.toJSON()).toMatchObject({
      permissions: ["metadata:read"],
      repositoryFullNames: ["acme/docs"],
      expired: false,
      redacted: true,
    });
  });

  test("[CORE-SRC-LEASE-007] fails closed when narrow removes all permissions", () => {
    const lease = createLease({
      permissions: ["contents:read"],
    })._unsafeUnwrap();

    const narrowed = lease.narrow({
      permissions: ["admin:write"],
      now: NOW,
    });

    expect(narrowed.isErr()).toBe(true);
    expect(narrowed._unsafeUnwrapErr().message).toBe("Provider app token permissions are required");
  });

  test("[CORE-SRC-LEASE-008] rehydrates an already-expired snapshot without inventing permissions", () => {
    const lease = ProviderAppTokenLease.rehydrate({
      providerKey: "gitlab",
      installationId: "inst_old",
      expiresAt: PAST,
      redacted: true,
      expired: true,
      permissions: ["read_api"],
    });

    expect(lease.isExpired()).toBe(true);
    expect(lease.toJSON()).toMatchObject({
      providerKey: "gitlab",
      installationId: "inst_old",
      expired: true,
      redacted: true,
      permissions: ["read_api"],
    });
  });
});

describe("SourceRepositoryAccess", () => {
  test("[CORE-SRC-ACCESS-001] models all-repository access with a redacted lease", () => {
    const access = SourceRepositoryAccess.create({
      providerKey: "GitHub",
      installationId: " inst_123 ",
      accountLogin: " acme ",
      repositoriesSelection: "all",
      repositories: [
        {
          id: " 1 ",
          name: " app ",
          fullName: " acme/app ",
          ownerLogin: " acme ",
          private: true,
          defaultBranch: "",
          htmlUrl: " https://github.com/acme/app ",
        },
      ],
      tokenLease: createLease()._unsafeUnwrap().toJSON(),
    })._unsafeUnwrap();

    expect(access.repositoryCount()).toBe(1);
    expect(access.toJSON()).toMatchObject({
      providerKey: "github",
      installationId: "inst_123",
      accountLogin: "acme",
      repositoriesSelection: "all",
      repositories: [
        {
          id: "1",
          name: "app",
          fullName: "acme/app",
          ownerLogin: "acme",
          private: true,
          defaultBranch: "main",
          htmlUrl: "https://github.com/acme/app",
        },
      ],
      tokenLease: expect.objectContaining({
        redacted: true,
        expired: false,
      }),
    });
  });

  test("[CORE-SRC-ACCESS-002] accepts selected repository access", () => {
    const access = SourceRepositoryAccess.create({
      providerKey: "github",
      installationId: "inst_123",
      repositoriesSelection: "selected",
      repositories: [
        {
          id: "2",
          name: "docs",
          fullName: "acme/docs",
          ownerLogin: "acme",
          private: false,
          defaultBranch: "main",
        },
      ],
      tokenLease: createLease()._unsafeUnwrap().toJSON(),
    });

    expect(access.isOk()).toBe(true);
    expect(access._unsafeUnwrap().toJSON().repositoriesSelection).toBe("selected");
  });

  test("[CORE-SRC-ACCESS-003] rejects unsupported repository selection", () => {
    const access = SourceRepositoryAccess.create({
      providerKey: "github",
      installationId: "inst_123",
      // @ts-expect-error intentional invalid selection
      repositoriesSelection: "owned",
      repositories: [],
      tokenLease: createLease()._unsafeUnwrap().toJSON(),
    });

    expect(access.isErr()).toBe(true);
    expect(access._unsafeUnwrapErr().message).toBe("Unsupported source repository selection owned");
  });

  test("[CORE-SRC-ACCESS-004] rejects blank installation ids", () => {
    const access = SourceRepositoryAccess.create({
      providerKey: "github",
      installationId: "   ",
      repositoriesSelection: "all",
      repositories: [],
      tokenLease: createLease()._unsafeUnwrap().toJSON(),
    });

    expect(access.isErr()).toBe(true);
    expect(access._unsafeUnwrapErr().message).toBe("Source installation id is required");
  });
});
