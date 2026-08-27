import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const values = new Map();
const properties = {
  getProperty: (key) => values.get(key) ?? null,
  setProperty: (key, value) => values.set(key, String(value)),
  setProperties: (entries) => Object.entries(entries).forEach(([key, value]) => values.set(key, String(value))),
  deleteProperty: (key) => values.delete(key),
};

let locked = false;
const lock = {
  tryLock() {
    if (locked) return false;
    locked = true;
    return true;
  },
  releaseLock() { locked = false; },
};

let uuid = 0;
const context = {
  console,
  PropertiesService: { getScriptProperties: () => properties },
  LockService: { getScriptLock: () => lock },
  Utilities: {
    getUuid: () => `uuid-${++uuid}`,
    formatDate: () => "2026-08-27",
  },
};
vm.createContext(context);
vm.runInContext(readFileSync("apps-script/telegram-queue.gs", "utf8"), context);

assert.equal(context.advanceTelegramCursorV2_(100, "b"), true);
assert.equal(context.readTelegramCursorV3_().time, 100);
assert.equal(context.readTelegramCursorV3_().id, "b");
assert.equal(context.advanceTelegramCursorV2_(99, "z"), false, "cursor must not move backward by time");
assert.equal(context.advanceTelegramCursorV2_(100, "a"), false, "cursor must not move backward by id");
assert.equal(context.advanceTelegramCursorV2_(100, "c"), true);
assert.equal(context.readTelegramCursorV3_().time, 100);
assert.equal(context.readTelegramCursorV3_().id, "c");

values.set("telegram_submission_legacy", "1720000000000");
assert.equal(context.claimTelegramSubmissionV3_("legacy", "worker"), "sent", "legacy markers remain sent");

assert.equal(context.claimTelegramSubmissionV3_("new", "worker-a"), "claimed");
assert.equal(context.claimTelegramSubmissionV3_("new", "worker-b"), "busy", "active claim blocks a second worker");
assert.equal(context.markTelegramSubmissionV3_("new", "sent", "worker-b"), false, "wrong owner cannot complete claim");
assert.equal(context.markTelegramSubmissionV3_("new", "sent", "worker-a"), true);
assert.equal(context.claimTelegramSubmissionV3_("new", "worker-b"), "sent");

assert.equal(context.claimTelegramSubmissionV3_("retry", "worker-a"), "claimed");
assert.equal(context.markTelegramSubmissionV3_("retry", "failed", "worker-a", new Error("Telegram down")), true);
assert.equal(context.claimTelegramSubmissionV3_("retry", "worker-b"), "busy", "failed sends honor retry delay");

const lease = context.acquireTelegramRecoveryLeaseV3_();
assert.ok(lease);
assert.equal(context.acquireTelegramRecoveryLeaseV3_(), "", "only one recovery lease is active");
context.releaseTelegramRecoveryLeaseV3_("not-owner");
assert.equal(context.acquireTelegramRecoveryLeaseV3_(), "", "wrong owner cannot release lease");
context.releaseTelegramRecoveryLeaseV3_(lease);
assert.ok(context.acquireTelegramRecoveryLeaseV3_(), "lease can be reacquired after release");

const source = readFileSync("apps-script/telegram-queue.gs", "utf8");
const notifierBody = source.slice(source.indexOf("function notifyNewSubmissionsV2"), source.indexOf("function notifySubmissionImmediately_"));
assert.ok(!notifierBody.includes("notifyCachedCompletedCertificateCandidatesV2_"), "five-minute notifier must not scan cached candidates");
assert.match(notifierBody, /TELEGRAM_RECOVERY_LIMIT/);
assert.match(notifierBody, /TELEGRAM_RECOVERY_BUDGET_MS/);

console.log("Telegram notifier tests passed: monotonic cursor, claims, retry delay, lease, bounded recovery");
