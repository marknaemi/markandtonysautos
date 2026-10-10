import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { Schema } from '../../data/resource';

const ses = new SESv2Client();

const clean = (v: string | null | undefined, max = 500) =>
  String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export const handler: Schema['requestBooking']['functionHandler'] = async (event) => {
  const a = event.arguments;
  if (a.website) return { ok: true }; // bot filled the hidden field; drop quietly

  const name = clean(a.name, 120);
  const phone = clean(a.phone, 40);
  const email = clean(a.email, 200);
  if (!name || !phone || !a.pickupDate || !a.returnDate) {
    return { ok: false, error: 'missing_fields' };
  }

  const lines = [
    'New rental request from markandtonysautos.com',
    '',
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Email: ${email || '(none)'}`,
    `Car: ${clean(a.car, 120) || 'Any available car'}`,
    `Pickup: ${clean(a.pickupDate, 20)}`,
    `Return: ${clean(a.returnDate, 20)}`,
    '',
    'Notes:',
    String(a.notes ?? '').trim().slice(0, 2000) || '(none)',
  ];

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: process.env.FROM_EMAIL,
      Destination: { ToAddresses: [process.env.TO_EMAIL!] },
      ReplyToAddresses: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? [email] : undefined,
      Content: {
        Simple: {
          Subject: { Data: `Rental request: ${name}, ${clean(a.pickupDate, 20)} to ${clean(a.returnDate, 20)}` },
          Body: { Text: { Data: lines.join('\n') } },
        },
      },
    }),
  );
  return { ok: true };
};
