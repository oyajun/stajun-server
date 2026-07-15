import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(email: string, otp: string) {
  const { data, error } = await resend.emails.send({
    from: 'StaJun <noreply@stajun.oyajun.com>',
    to: [email],
    subject: 'StaJun 確認コード',
    html: `<p>確認コード: <strong>${otp}</strong></p><p>このコードは発行から一定時間で失効します。</p>`,
  });

  if (error) {
    throw new Error(`Resend email send failed: ${error.message}`);
  }
}
