import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSign } from "../src/tiktok/sign.ts";

/**
 * Known-good vector taken verbatim from the Partner Center doc
 * "Sign your API request" -> Step-by-step breakdown.
 * https://partner.tiktokshop.com/docv2/page/sign-your-api-request
 */
test("matches the worked example in the signing doc", () => {
  const sign = generateSign({
    path: "/authorization/202309/shops",
    query: { app_key: "29a39d", timestamp: 1623812664 },
    appSecret: "e59af819cc",
  });

  assert.equal(sign, "b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8");
});

test("excludes sign and access_token from the base string", () => {
  const base = {
    path: "/authorization/202309/shops",
    query: { app_key: "29a39d", timestamp: 1623812664 },
    appSecret: "e59af819cc",
  };
  const polluted = {
    ...base,
    query: {
      ...base.query,
      sign: "should-be-ignored",
      access_token: "TTP_should-be-ignored",
    },
  };

  assert.equal(generateSign(polluted), generateSign(base));
});

test("sorts query keys alphabetically, not by insertion order", () => {
  const a = generateSign({
    path: "/x",
    query: { timestamp: 1, app_key: "k", shop_cipher: "c" },
    appSecret: "s",
  });
  const b = generateSign({
    path: "/x",
    query: { app_key: "k", shop_cipher: "c", timestamp: 1 },
    appSecret: "s",
  });

  assert.equal(a, b);
});

test("appends the body for json requests and ignores it for multipart", () => {
  const withBody = generateSign({
    path: "/x",
    query: { app_key: "k", timestamp: 1 },
    body: '{"page_size":20}',
    contentType: "application/json",
    appSecret: "s",
  });
  const withoutBody = generateSign({
    path: "/x",
    query: { app_key: "k", timestamp: 1 },
    appSecret: "s",
  });
  const multipart = generateSign({
    path: "/x",
    query: { app_key: "k", timestamp: 1 },
    body: '{"page_size":20}',
    contentType: "multipart/form-data; boundary=abc",
    appSecret: "s",
  });

  assert.notEqual(withBody, withoutBody);
  assert.equal(multipart, withoutBody);
});

test("body whitespace changes the signature (sign the exact bytes sent)", () => {
  const compact = generateSign({
    path: "/x",
    query: { app_key: "k", timestamp: 1 },
    body: '{"a":1}',
    contentType: "application/json",
    appSecret: "s",
  });
  const pretty = generateSign({
    path: "/x",
    query: { app_key: "k", timestamp: 1 },
    body: '{\n  "a": 1\n}',
    contentType: "application/json",
    appSecret: "s",
  });

  assert.notEqual(compact, pretty);
});
