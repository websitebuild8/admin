import assert from "node:assert/strict";
import test from "node:test";
import {
  storageConfigurationStatus,
  storageProjectOrigin,
  storageServerKey,
} from "./storage-configuration";

const configured = {
  SUPABASE_URL: "https://test-project.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_private_test_value",
};

test("storage diagnostics distinguish missing URL and missing server key", () => {
  const report = storageConfigurationStatus({});
  assert.equal(report.configurationValid, false);
  assert.equal(report.projectUrl.code, "missing");
  assert.equal(report.serverKey.code, "missing");
  assert.equal(
    storageConfigurationStatus({ SUPABASE_URL: configured.SUPABASE_URL })
      .serverKey.code,
    "missing",
  );
  assert.equal(
    storageConfigurationStatus({
      SUPABASE_SECRET_KEY: configured.SUPABASE_SECRET_KEY,
    }).projectUrl.code,
    "missing",
  );
});

test("quoted Netlify values are identified without silently changing credentials", () => {
  const report = storageConfigurationStatus({
    SUPABASE_URL: `"${configured.SUPABASE_URL}"`,
    SUPABASE_SECRET_KEY: `'${configured.SUPABASE_SECRET_KEY}'`,
  });
  assert.equal(report.projectUrl.code, "quoted-value");
  assert.equal(report.serverKey.code, "quoted-value");
});

test("dashboard links, database strings and API paths cannot replace the project origin", () => {
  for (const SUPABASE_URL of [
    "https://supabase.com/dashboard/project/test-project",
    "postgresql://user:password@db.test-project.supabase.co/postgres",
    "https://test-project.supabase.co/rest/v1",
    "http://test-project.supabase.co",
    "https://user:password@test-project.supabase.co",
    "https://test-project.supabase.co?key=secret",
    "https://test-project.supabase.co#fragment",
    "https://test-project.supabase.co.evil.example",
    "not a URL",
  ]) {
    assert.equal(
      storageConfigurationStatus({ ...configured, SUPABASE_URL }).projectUrl
        .status,
      "invalid",
    );
    assert.throws(() => storageProjectOrigin({ SUPABASE_URL }));
  }
});

test("publishable keys and placeholder text do not pass private-key configuration checks", () => {
  assert.equal(
    storageConfigurationStatus({
      ...configured,
      SUPABASE_SECRET_KEY: "sb_publishable_test_value",
    }).serverKey.code,
    "publishable-key",
  );
  for (const SUPABASE_SECRET_KEY of [
    "your-secret-key",
    "Bearer sb_secret_test_value",
  ])
    assert.equal(
      storageConfigurationStatus({ ...configured, SUPABASE_SECRET_KEY })
        .serverKey.code,
      "unrecognized-key-format",
    );
});

test("modern and legacy server-key selection matches the upload configuration", () => {
  assert.equal(storageConfigurationStatus(configured).configurationValid, true);
  assert.equal(storageServerKey(configured), configured.SUPABASE_SECRET_KEY);
  const legacy = {
    SUPABASE_URL: configured.SUPABASE_URL,
    SUPABASE_SECRET_KEY: "  ",
    SUPABASE_SERVICE_ROLE_KEY: "eyJlegacy_test_value",
  };
  assert.equal(storageConfigurationStatus(legacy).configurationValid, true);
  assert.equal(
    storageConfigurationStatus(legacy).serverKey.variable,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  assert.equal(storageServerKey(legacy), legacy.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(
    storageConfigurationStatus({ ...legacy, SUPABASE_SECRET_KEY: "wrong-key" })
      .serverKey.code,
    "unrecognized-key-format",
  );
});

test("diagnostics never serialize project URL or any credential value", () => {
  for (const env of [
    configured,
    { ...configured, SUPABASE_URL: `"${configured.SUPABASE_URL}"` },
    {
      ...configured,
      SUPABASE_SECRET_KEY: `"${configured.SUPABASE_SECRET_KEY}"`,
    },
    {
      SUPABASE_URL: configured.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: "eyJlegacy_private_value",
    },
  ]) {
    const serialized = JSON.stringify(storageConfigurationStatus(env));
    for (const value of Object.values(env)) {
      assert.equal(serialized.includes(value), false);
      assert.equal(serialized.includes(value.replaceAll('"', "")), false);
    }
  }
});
