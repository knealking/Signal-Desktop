// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { DraftBodyRanges } from './BodyRange.std.ts';

export type ScheduledMessageType = Readonly<{
  id: string;
  conversationId: string;
  body: string;
  bodyRanges: DraftBodyRanges;
  // Timestamp (ms) at which the message should be sent
  sendAt: number;
  createdAt: number;
}>;

export type ScheduledMessagesType = ReadonlyArray<ScheduledMessageType>;
