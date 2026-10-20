import test from "node:test";
import assert from "node:assert/strict";
import { pushOwnerKey, waitForPushWorker } from "./delivery/browser-push";
class Worker extends EventTarget {
  constructor(public state: ServiceWorkerState) {
    super();
  }
  change(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}
const registration = (value: object) => value as ServiceWorkerRegistration;
test("riders keep the existing device owner key while partners use a separate key", () => {
  assert.equal(pushOwnerKey("DRIVER"), "igo-rider-push-owner");
  assert.equal(pushOwnerKey("PARTNER"), "igo-partner-push-owner");
});
test("first-time push setup waits for its own installing worker to activate", async () => {
  const worker = new Worker("installing"),
    reg = registration({ installing: worker, active: null, waiting: null });
  let ready = false;
  const setup = waitForPushWorker(reg).then((v) => {
    ready = true;
    return v;
  });
  await Promise.resolve();
  assert.equal(ready, false);
  worker.change("installed");
  await Promise.resolve();
  assert.equal(ready, false);
  worker.change("activated");
  assert.equal(await setup, reg);
});
test("already active workers are reused and failed/absent workers give retryable errors", async () => {
  const reg = registration({ active: new Worker("activated") });
  assert.equal(await waitForPushWorker(reg), reg);
  await assert.rejects(waitForPushWorker(registration({})), /retry/i);
  await assert.rejects(
    waitForPushWorker(registration({ installing: new Worker("redundant") })),
    /retry/i,
  );
  await assert.rejects(
    waitForPushWorker(
      registration({ installing: new Worker("installing") }),
      1,
    ),
    /retry/i,
  );
});
