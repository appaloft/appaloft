import { describe, expect, test } from "bun:test";

import {
  appaloftLocaleCookieName,
  appaloftLocaleHeader,
  createAppaloftTranslator,
  defaultAppaloftLocale,
  i18nKeys,
  normalizeAppaloftLocale,
  resolveAppaloftLocaleFromAcceptLanguage,
  resolveAppaloftLocaleFromHeaders,
} from ".";

describe("Appaloft locale resolution", () => {
  test("defaults to English when no explicit locale is selected", () => {
    expect(defaultAppaloftLocale).toBe("en-US");
    expect(normalizeAppaloftLocale(undefined)).toBe("en-US");
    expect(resolveAppaloftLocaleFromAcceptLanguage("fr-FR,fr;q=0.9")).toBe("en-US");
    expect(
      resolveAppaloftLocaleFromHeaders(new Headers({ "accept-language": "fr-FR,fr;q=0.9" })),
    ).toBe("en-US");
  });

  test("resolves the best supported locale from Accept-Language", () => {
    expect(resolveAppaloftLocaleFromAcceptLanguage("zh-CN,zh;q=0.9,en-US;q=0.5")).toBe("zh-CN");
    expect(resolveAppaloftLocaleFromAcceptLanguage("fr-FR;q=1, zh-Hans-CN;q=0.8")).toBe("zh-CN");
    expect(resolveAppaloftLocaleFromAcceptLanguage("fr-FR;q=1, en-GB;q=0.8")).toBe("en-US");
    expect(resolveAppaloftLocaleFromAcceptLanguage("zh-CN;q=0, en-US;q=0.5")).toBe("en-US");
  });

  test("prefers explicit locale and cookie over Accept-Language", () => {
    expect(
      resolveAppaloftLocaleFromHeaders(
        new Headers({
          cookie: `${appaloftLocaleCookieName}=zh-CN`,
          "accept-language": "en-US,en;q=0.9",
        }),
      ),
    ).toBe("zh-CN");
    expect(
      resolveAppaloftLocaleFromHeaders(
        new Headers({
          [appaloftLocaleHeader]: "en-US",
          cookie: `${appaloftLocaleCookieName}=zh-CN`,
          "accept-language": "zh-CN,zh;q=0.9",
        }),
      ),
    ).toBe("en-US");
  });

  test("keeps an explicit Chinese selection", () => {
    expect(normalizeAppaloftLocale("zh-CN")).toBe("zh-CN");
    expect(resolveAppaloftLocaleFromHeaders(new Headers({ [appaloftLocaleHeader]: "zh-CN" }))).toBe(
      "zh-CN",
    );
    expect(
      createAppaloftTranslator({ locale: "zh-CN" })(i18nKeys.common.language.simplifiedChinese),
    ).toBe("简体中文");
  });
});
