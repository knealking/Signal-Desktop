// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { PowerSaveBlocker } from 'electron';
import { createLogger } from '../ts/logging/log.std.ts';

const log = createLogger('ScheduledMessagesWakeService');

// setTimeout can't take delays larger than a signed 32-bit int
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// Renderer timers are throttled by Chromium while the window is hidden, and
// macOS App Nap can suspend the whole app. The main process owns a precise
// timer for the next scheduled message and pings the renderer when it is due,
// while preventing app suspension as long as scheduled messages are pending.
export class ScheduledMessagesWakeService {
  readonly #powerSaveBlocker: PowerSaveBlocker;
  readonly #onWake: () => void;
  #blockerId: number | undefined;
  #timeout: NodeJS.Timeout | undefined;
  #nextSendAt: number | null = null;

  constructor(powerSaveBlocker: PowerSaveBlocker, onWake: () => void) {
    this.#powerSaveBlocker = powerSaveBlocker;
    this.#onWake = onWake;
  }

  setNextSendAt(nextSendAt: number | null): void {
    if (nextSendAt === this.#nextSendAt) {
      return;
    }
    this.#nextSendAt = nextSendAt;

    if (this.#timeout) {
      clearTimeout(this.#timeout);
      this.#timeout = undefined;
    }

    if (nextSendAt == null) {
      log.info('no scheduled messages pending');
      this.#stopBlocker();
      return;
    }

    log.info(`next scheduled message at ${new Date(nextSendAt).toISOString()}`);
    this.#startBlocker();
    this.#arm();
  }

  #arm(): void {
    const nextSendAt = this.#nextSendAt;
    if (nextSendAt == null) {
      return;
    }
    const delay = Math.max(
      0,
      Math.min(nextSendAt - Date.now(), MAX_TIMEOUT_MS)
    );
    this.#timeout = setTimeout(() => {
      this.#timeout = undefined;
      if (this.#nextSendAt == null) {
        return;
      }
      if (Date.now() < this.#nextSendAt) {
        // Delay was clamped, keep waiting
        this.#arm();
        return;
      }
      this.#onWake();
      // The renderer reports the new next time after processing. Retry in a
      // bit in case it was busy or the message failed to send.
      this.#timeout = setTimeout(() => {
        this.#timeout = undefined;
        if (this.#nextSendAt != null && Date.now() >= this.#nextSendAt) {
          this.#onWake();
          this.#arm();
        }
      }, 15 * 1000);
    }, delay);
  }

  #startBlocker(): void {
    if (this.#blockerId !== undefined) {
      return;
    }
    this.#blockerId = this.#powerSaveBlocker.start('prevent-app-suspension');
  }

  #stopBlocker(): void {
    if (this.#blockerId === undefined) {
      return;
    }
    this.#powerSaveBlocker.stop(this.#blockerId);
    this.#blockerId = undefined;
  }
}
