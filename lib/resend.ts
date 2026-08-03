import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(email: string, otp: string) {
  const { data, error } = await resend.emails.send({
    from: 'JunJun <noreply@stajun.oyajun.com>',
    to: [email],
    subject: 'JunJun 確認コード',
    html: `<p>確認コード: <strong>${otp}</strong></p><p>このコードは発行から一定時間で失効します。</p>`,
  });

  if (error) {
    console.error('Resend email send failed:', error);
    throw new Error(`Resend email send failed: ${error.message}`);
  }
}

export async function sendReportEmail(
  targetEmail: string,
  postId: string,
  postContent: string,
  postUserName: string,
  reporterName: string
) {
  const { data, error } = await resend.emails.send({
    from: 'JunJun <noreply@stajun.oyajun.com>',
    to: [targetEmail],
    subject: `[JunJun] 投稿の報告: ${postId}`,
    html: `
      <h2>投稿の報告がありました</h2>
      <p><strong>報告者:</strong> ${reporterName}</p>
      <hr />
      <p><strong>投稿ID:</strong> ${postId}</p>
      <p><strong>投稿者:</strong> ${postUserName}</p>
      <p><strong>投稿内容:</strong></p>
      <blockquote style="background: #f9f9f9; padding: 10px; border-left: 5px solid #ccc; white-space: pre-wrap;">${postContent}</blockquote>
    `,
  });

  if (error) {
    console.error('Resend email send failed:', error);
    throw new Error(`Resend email send failed: ${error.message}`);
  }
}
