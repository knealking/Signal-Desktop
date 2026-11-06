// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import * as sinon from 'sinon';
import type { PowerSaveBlocker } from 'electron';

import { ScheduledMessagesWakeService } from '../../../app/ScheduledMessagesWakeService.std.ts';

describe('ScheduledMessagesWakeService', () => {
  class FakePowerSaveBlocker implements PowerSaveBlocker {
    #nextId = 0;
    readonly started = new Set<number>();

    isStarted(id: number): boolean {
      return this.started.has(id);
    }

    start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number {
      assert.strictEqual(type, 'prevent-app-suspension');
      const id = this.#nextId;
      this.#nextId += 1;
      this.started.add(id);
      return id;
    }

    stop(id: number): boolean {
      assert(this.started.has(id), `${id} was never started`);
      this.started.delete(id);
      return true;
    }
  }

  let clock: sinon.SinonFakeTimers;
  let blocker: FakePowerSaveBlocker;
  let onWake: sinon.SinonSpy;
  let service: ScheduledMessagesWakeService;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ now: 1_000_000 });
    blocker = new FakePowerSaveBlocker();
    onWake = sinon.spy();
    service = new ScheduledMessagesWakeService(blocker, onWake);
  });

  afterEach(() => {
    clock.restore();
  });

  it('wakes the renderer when the next message is due', () => {
    service.setNextSendAt(Date.now() + 60_000);
    clock.tick(59_999);
    sinon.assert.notCalled(onWake);
    clock.tick(1);
    sinon.assert.calledOnce(onWake);
  });

  it('prevents app suspension only while messages are pending', () => {
    assert.strictEqual(blocker.started.size, 0);
    service.setNextSendAt(Date.now() + 1000);
    assert.strictEqual(blocker.started.size, 1);
    // Updating the time doesn't start a second blocker
    service.setNextSendAt(Date.now() + 2000);
    assert.strictEqual(blocker.started.size, 1);
    service.setNextSendAt(null);
    assert.strictEqual(blocker.started.size, 0);
  });

  it('wakes immediately for overdue messages', () => {
    service.setNextSendAt(Date.now() - 5000);
    clock.tick(0);
    sinon.assert.calledOnce(onWake);
  });

  it('cancels the timer when no messages are pending', () => {
    service.setNextSendAt(Date.now() + 1000);
    service.setNextSendAt(null);
    clock.tick(60_000);
    sinon.assert.notCalled(onWake);
  });

  it('retries the wake if the renderer has not rescheduled', () => {
    service.setNextSendAt(Date.now() + 1000);
    clock.tick(1000);
    sinon.assert.calledOnce(onWake);
    clock.tick(15_000);
    sinon.assert.calledTwice(onWake);
  });

  it('handles delays longer than the max setTimeout', () => {
    const farFuture = Date.now() + 2 ** 31 + 10_000;
    service.setNextSendAt(farFuture);
    clock.tick(2 ** 31 - 1);
    sinon.assert.notCalled(onWake);
    clock.tick(farFuture - Date.now());
    sinon.assert.calledOnce(onWake);
  });
});
