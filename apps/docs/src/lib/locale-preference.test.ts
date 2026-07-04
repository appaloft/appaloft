import { describe, expect, test } from "bun:test";

import {
  docsLocaleFromPath,
  docsPathForLocale,
  normalizeDocsLocale,
  parseLocaleCookie,
  preferredDocsLocale,
  serializeLocaleCookie,
} from "@/lib/locale-preference";

describe("docs locale preference", () => {
  test("normalizes Appaloft locale aliases", () => {
    expect(normalizeDocsLocale("en")).toBe("en-US");
    expect(normalizeDocsLocale("en-GB")).toBe("en-US");
    expect(normalizeDocsLocale("zh")).toBe("zh-CN");
    expect(normalizeDocsLocale("zh_Hans_CN")).toBe("zh-CN");
    expect(normalizeDocsLocale("fr-FR")).toBeUndefined();
  });

  test("prefers explicit query, cookie, storage, and browser languages in order", () => {
    expect(
      preferredDocsLocale({
        cookieLocale: "zh-CN",
        localStorageLocale: "en-US",
        navigatorLanguages: ["zh-CN"],
        searchParams: new URLSearchParams("locale=zh-CN"),
      }),
    ).toBe("zh-CN");
    expect(
      preferredDocsLocale({
        cookieLocale: "zh-CN",
        localStorageLocale: "en-US",
        navigatorLanguages: ["zh-CN"],
      }),
    ).toBe("zh-CN");
    expect(
      preferredDocsLocale({ localStorageLocale: "en-US", navigatorLanguages: ["zh-CN"] }),
    ).toBe("en-US");
    expect(preferredDocsLocale({ navigatorLanguages: ["fr-FR", "en-GB"] })).toBe("en-US");
  });

  test("maps static docs paths between Chinese root and English prefix", () => {
    expect(docsLocaleFromPath("/", "/")).toBe("zh-CN");
    expect(docsLocaleFromPath("/en/start/first-deployment/", "/")).toBe("en-US");
    expect(
      docsPathForLocale({
        docsBase: "/",
        locale: "en-US",
        pathname: "/start/first-deployment/",
      }),
    ).toBe("/en/start/first-deployment/");
    expect(
      docsPathForLocale({
        docsBase: "/",
        locale: "zh-CN",
        pathname: "/en/start/first-deployment/",
      }),
    ).toBe("/start/first-deployment/");
  });

  test("keeps embedded /docs base paths when mapping locales", () => {
    expect(
      docsPathForLocale({
        docsBase: "/docs",
        locale: "en-US",
        pathname: "/docs/start/first-deployment/",
      }),
    ).toBe("/docs/en/start/first-deployment/");
    expect(
      docsPathForLocale({
        docsBase: "/docs",
        locale: "zh-CN",
        pathname: "/docs/en/start/first-deployment/",
      }),
    ).toBe("/docs/start/first-deployment/");
  });

  test("uses the shared Appaloft locale cookie name and options", () => {
    expect(parseLocaleCookie("theme=dark; appaloft.locale=zh-CN")).toBe("zh-CN");
    expect(serializeLocaleCookie({ domain: ".appaloft.com", locale: "en-US", secure: true })).toBe(
      "appaloft.locale=en-US; Path=/; Max-Age=31536000; SameSite=Lax; Secure; Domain=.appaloft.com",
    );
  });
});
