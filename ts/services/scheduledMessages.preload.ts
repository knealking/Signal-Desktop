// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer } from 'electron';
import { v4 as generateUuid } from 'uuid';

import { createLogger } from '../logging/log.std.ts';
import * as Errors from '../types/errors.std.ts';
import { itemStorage } from '../textsecure/Storage.preload.ts';
import { drop } from '../util/drop.std.ts';
import type { DraftBodyRanges } from '../types/BodyRange.std.ts';
import type {
  ScheduledMessageType,
  ScheduledMessagesType,
} from '../types/ScheduledMessage.std.ts';

const log = createLogger('scheduledMessages');

const STORAGE_KEY = 'scheduledMessages';

// Fallback poll interval. The main process wakes us up at the exact time (its
// timers aren't throttled when the window is hidden), this is a safety net.
const POLL_INTERVAL_MS = 30 * 1000;

export const SCHEDULED_MESSAGES_WAKE_CHANNEL = 'scheduled-messages:wake';
export const SCHEDULED_MESSAGES_SET_NEXT_CHANNEL =
  'scheduled-messages:set-next-send-at';

class ScheduledMessagesService {
  #isInitialized = false;
  #isProcessing = false;
  #needsReprocess = false;
  #pollInterval: NodeJS.Timeout | undefined;
  readonly #inFlight = new Set<string>();

  init(): void {
    if (this.#isInitialized) {
      return;
    }
    this.#isInitialized = true;

    const pending = this.getAll();
    log.info(`init: ${pending.length} scheduled message(s) pending`);

    ipcRenderer.on(SCHEDULED_MESSAGES_WAKE_CHANNEL, () => {
      log.info('wake from main process');
      drop(this.processDue());
    });
    window.Whisper.events.on('powerMonitorResume', () => {
      drop(this.processDue());
    });

    // Sends anything that became due while the app was closed
    drop(this.processDue());
  }

  getAll(): ScheduledMessagesType {
    return itemStorage.get(STORAGE_KEY) ?? [];
  }

  async schedule(options: {
    conversationId: string;
    body: string;
    bodyRanges: DraftBodyRanges;
    sendAt: number;
  }): Promise<ScheduledMessageType> {
    const entry: ScheduledMessageType = {
      id: generateUuid(),
      conversationId: options.conversationId,
      body: options.body,
      bodyRanges: options.bodyRanges,
      sendAt: options.sendAt,
      createdAt: Date.now(),
    };
    log.info(
      `schedule: ${entry.id} for conversation ${entry.conversationId} ` +
        `at ${new Date(entry.sendAt).toISOString()}`
    );
    await this.#save([...this.getAll(), entry]);
    drop(this.processDue());
    return entry;
  }

  async cancel(id: string): Promise<void> {
    log.info(`cancel: ${id}`);
    await this.#save(this.getAll().filter(item => item.id !== id));
  }

  async processDue(): Promise<void> {
    if (!this.#isInitialized) {
      return;
    }
    if (this.#isProcessing) {
      this.#needsReprocess = true;
      return;
    }
    this.#isProcessing = true;

    try {
      do {
        this.#needsReprocess = false;
        const now = Date.now();
        const due = this.getAll()
          .filter(item => item.sendAt <= now && !this.#inFlight.has(item.id))
          .toSorted((a, b) => a.sendAt - b.sendAt);

        for (const item of due) {
          // oxlint-disable-next-line no-await-in-loop
          await this.#send(item);
        }
      } while (this.#needsReprocess);
    } finally {
      this.#isProcessing = false;
      this.#updateTimers();
    }
  }

  async #send(item: ScheduledMessageType): Promise<void> {
    this.#inFlight.add(item.id);
    try {
      const conversation = window.ConversationController.get(
        item.conversationId
      );
      if (!conversation) {
        log.warn(`send: conversation for ${item.id} not found, dropping`);
        await this.#remove(item.id);
        return;
      }

      const lateBy = Date.now() - item.sendAt;
      log.info(`send: sending ${item.id} (late by ${lateBy}ms)`);

      // Once enqueued, the message is persisted and retried by the
      // conversation job queue (including when offline), so we can drop our
      // copy afterwards.
      await conversation.enqueueMessageForSend(
        {
          body: item.body,
          bodyRanges: item.bodyRanges,
          attachments: [],
        },
        {
          // Don't wipe whatever the user is currently typing in this chat
          dontClearDraft: true,
          timestamp: Date.now(),
        }
      );
      await this.#remove(item.id);
    } catch (error) {
      // Leave it in storage; it will be retried on the next tick
      log.error(`send: failed to send ${item.id}`, Errors.toLogFormat(error));
    } finally {
      this.#inFlight.delete(item.id);
    }
  }

  async #remove(id: string): Promise<void> {
    await this.#save(this.getAll().filter(item => item.id !== id));
  }

  async #save(items: ScheduledMessagesType): Promise<void> {
    if (items.length === 0) {
      await itemStorage.remove(STORAGE_KEY);
    } else {
      await itemStorage.put(STORAGE_KEY, items);
    }
    this.#updateTimers();
  }

  #updateTimers(): void {
    const items = this.getAll();
    const nextSendAt =
      items.length > 0 ? Math.min(...items.map(item => item.sendAt)) : null;

    // The main process owns the precise timer and keeps the app from being
    // suspended (App Nap) while messages are pending.
    ipcRenderer.send(SCHEDULED_MESSAGES_SET_NEXT_CHANNEL, nextSendAt);

    if (nextSendAt == null) {
      if (this.#pollInterval) {
        clearInterval(this.#pollInterval);
        this.#pollInterval = undefined;
      }
    } else if (!this.#pollInterval) {
      this.#pollInterval = setInterval(() => {
        drop(this.processDue());
      }, POLL_INTERVAL_MS);
    }
  }
}

export const scheduledMessagesService = new ScheduledMessagesService();
