// The name a message is signed with. It must only ever be the sender's own: never
// fall back to a particular person's name.

export const SENDER_NAME_PLACEHOLDER = '[Your Name]';

type SenderRecord = { firstName?: string | null; lastName?: string | null } | null | undefined;

/**
 * Uses the loan officer or realtor record, then the account's own full name, then a
 * placeholder the sender will see in the draft before sending.
 */
export function senderNames(record: SenderRecord, accountFullName?: unknown) {
  const first = record?.firstName?.trim() ?? '';
  const recordName = [first, record?.lastName?.trim()].filter(Boolean).join(' ');
  const accountName = typeof accountFullName === 'string' ? accountFullName.trim() : '';
  const loFullname = recordName || accountName || SENDER_NAME_PLACEHOLDER;
  const loFname =
    first || (loFullname === SENDER_NAME_PLACEHOLDER ? loFullname : loFullname.split(/\s+/)[0]);
  return { loFullname, loFname };
}
