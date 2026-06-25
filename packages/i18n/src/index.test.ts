import { describe, expect, test } from "bun:test";

import {
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
    expect(resolveAppaloftLocaleFromAcceptLanguage("zh-CN,zh;q=0.9")).toBe("en-US");
    expect(
      resolveAppaloftLocaleFromHeaders(new Headers({ "accept-language": "zh-CN,zh;q=0.9" })),
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
