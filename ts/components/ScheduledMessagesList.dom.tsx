// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { memo, type JSX } from 'react';

import type { LocalizerType } from '../types/Util.std.ts';
import type { ScheduledMessagesType } from '../types/ScheduledMessage.std.ts';
import { AxoIconButton } from '../axo/AxoIconButton.dom.tsx';
import { AxoSymbol } from '../axo/AxoSymbol.dom.tsx';
import { tw } from '../axo/tw.dom.tsx';
import { formatDateTimeLong } from '../util/formatTimestamp.dom.ts';

export type PropsType = Readonly<{
  i18n: LocalizerType;
  scheduledMessages: ScheduledMessagesType;
  onCancel: (id: string) => void;
}>;

export const ScheduledMessagesList = memo(function ScheduledMessagesList({
  i18n,
  scheduledMessages,
  onCancel,
}: PropsType): JSX.Element | null {
  if (scheduledMessages.length === 0) {
    return null;
  }

  return (
    <ul
      className={tw('mx-3 mt-2 mb-1 flex flex-col gap-1')}
      aria-label={i18n('icu:ScheduledMessages__listLabel')}
      data-testid="ScheduledMessagesList"
    >
      {scheduledMessages
        .toSorted((a, b) => a.sendAt - b.sendAt)
        .map(item => (
          <li
            key={item.id}
            className={tw(
              'flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5'
            )}
          >
            <AxoSymbol.Icon symbol="clock" size={16} label={null} />
            <div className={tw('flex min-w-0 grow flex-col')}>
              <span className={tw('type-body-small text-secondary')}>
                {i18n('icu:ScheduledMessages__scheduledFor', {
                  time: formatDateTimeLong(i18n, item.sendAt),
                })}
              </span>
              <span className={tw('truncate type-body-medium text-primary')}>
                {item.body}
              </span>
            </div>
            <AxoIconButton.Root
              symbol="x"
              variant="implied-secondary"
              size="sm"
              label={i18n('icu:ScheduledMessages__cancel')}
              onClick={() => onCancel(item.id)}
            />
          </li>
        ))}
    </ul>
  );
});
