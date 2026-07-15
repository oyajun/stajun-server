export async function sendOtpEmail(email: string, otp: string) {
  const res = await fetch("https://api.onesignal.com/notifications?c=email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${process.env.ONESIGNAL_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: process.env.ONESIGNAL_APP_ID,
      email_subject: "StaJun 確認コード",
      email_body: `<p>確認コード: <strong>${otp}</strong></p><p>このコードは発行から一定時間で失効します。</p>`,
      email_to: [email],
    }),
  });

  if (!res.ok) {
    throw new Error(`OneSignal email send failed: ${res.status} ${await res.text()}`);
  }
}
