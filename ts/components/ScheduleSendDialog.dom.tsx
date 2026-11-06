// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useMemo, useState, type JSX } from 'react';
import type { CalendarDate } from '@internationalized/date';
import {
  fromDate,
  getLocalTimeZone,
  Time,
  toCalendarDate,
  toCalendarDateTime,
  today,
} from '@internationalized/date';

import type { LocalizerType } from '../types/Util.std.ts';
import { AxoDialog } from '../axo/AxoDialog.dom.tsx';
import { tw } from '../axo/tw.dom.tsx';
import {
  formatDateTimeLong,
  getDateTimeFormatter,
} from '../util/formatTimestamp.dom.ts';
import { DatePicker } from './DatePicker.dom.tsx';
import { getTimeDetails, TimePicker } from './TimePicker.dom.tsx';

const MINUTE = 60 * 1000;
const DEFAULT_MINUTES_IN_FUTURE = 5;

export type PropsType = Readonly<{
  i18n: LocalizerType;
  onSubmit: (sendAt: number) => void;
  onClose: () => void;
}>;

function getDefaultDateAndTime(): { date: CalendarDate; time: number } {
  // At least 5 minutes from now, rounded up to the next 5 minute mark
  const step = DEFAULT_MINUTES_IN_FUTURE * MINUTE;
  const target = new Date(Math.ceil((Date.now() + step) / step) * step);
  const zoned = fromDate(target, getLocalTimeZone());
  return {
    date: toCalendarDate(zoned),
    time: zoned.hour * 100 + zoned.minute,
  };
}

export function ScheduleSendDialog({
  i18n,
  onSubmit,
  onClose,
}: PropsType): JSX.Element {
  const [initial] = useState(getDefaultDateAndTime);
  const [date, setDate] = useState<CalendarDate | null>(initial.date);
  const [time, setTime] = useState(initial.time);

  const earliestDate = useMemo(() => {
    return today(getLocalTimeZone());
  }, []);

  const sendAt = useMemo(() => {
    return getTimestamp(date, time);
  }, [date, time]);

  // oxlint-disable-next-line react/purity
  const isValid = sendAt != null && sendAt > Date.now();

  const timeZoneNote = useMemo(() => {
    return i18n('icu:ScheduleSendDialog__timeZoneNote', {
      timeZone: getTimeZoneDisplayName(),
    });
  }, [i18n]);

  const handleSubmit = useCallback(() => {
    if (sendAt == null || sendAt <= Date.now()) {
      return;
    }
    onSubmit(sendAt);
  }, [sendAt, onSubmit]);

  return (
    <AxoDialog.Root
      open
      onOpenChange={isOpen => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <AxoDialog.Content
        size="sm"
        escape="cancel-is-noop"
        disableMissingAriaDescriptionWarning
      >
        <AxoDialog.Header>
          <AxoDialog.Title>
            {i18n('icu:ScheduleSendDialog__title')}
          </AxoDialog.Title>
          <AxoDialog.Close />
        </AxoDialog.Header>
        <AxoDialog.Body>
          <div className={tw('mb-2.5 flex items-center gap-2')}>
            <DatePicker
              i18n={i18n}
              aria-label={i18n('icu:ScheduleSendDialog__dateLabel')}
              minValue={earliestDate}
              value={date}
              onUpdateDate={setDate}
            />
            <TimePicker
              i18n={i18n}
              aria-label={i18n('icu:ScheduleSendDialog__timeLabel')}
              time={time}
              isDisabled={false}
              onUpdateTime={setTime}
            />
          </div>
          <p className={tw('text-secondary')}>
            {isValid
              ? i18n('icu:ScheduleSendDialog__willSendAt', {
                  time: formatDateTimeLong(i18n, sendAt),
                })
              : i18n('icu:ScheduleSendDialog__pastTime')}
          </p>
          <p className={tw('text-secondary')}>{timeZoneNote}</p>
        </AxoDialog.Body>
        <AxoDialog.Footer>
          <AxoDialog.Actions>
            <AxoDialog.Action variant="subtle-secondary" onClick={onClose}>
              {i18n('icu:cancel')}
            </AxoDialog.Action>
            <AxoDialog.Action
              variant="strong-primary"
              disabled={!isValid}
              onClick={handleSubmit}
            >
              {i18n('icu:ScheduleSendDialog__submit')}
            </AxoDialog.Action>
          </AxoDialog.Actions>
        </AxoDialog.Footer>
      </AxoDialog.Content>
    </AxoDialog.Root>
  );
}

function getTimestamp(date: CalendarDate | null, time: number): number | null {
  if (date == null) {
    return null;
  }

  const { hours, minutes } = getTimeDetails(time, true);
  return toCalendarDateTime(date, new Time(hours, minutes))
    .toDate(getLocalTimeZone())
    .valueOf();
}

function getTimeZoneDisplayName(): string {
  const formatter = getDateTimeFormatter({ timeZoneName: 'longGeneric' });
  const timeZoneName = formatter
    .formatToParts(Date.now())
    .find(part => part.type === 'timeZoneName');

  return timeZoneName?.value ?? formatter.resolvedOptions().timeZone;
}
