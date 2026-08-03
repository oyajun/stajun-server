import 'dotenv/config';
import { sendReportEmail } from './lib/resend';

async function testEmail() {
  const targetEmail = process.env.REPORT_EMAIL_ADDRESS;
  if (!targetEmail) {
    console.error('REPORT_EMAIL_ADDRESS is not set');
    return;
  }
  
  console.log(`Sending test report email to ${targetEmail}...`);
  try {
    await sendReportEmail(
      targetEmail,
      "test_post_12345",
      "これはテスト環境からの直接送信テストです。\n不適切な内容があった場合の報告機能の確認テストです。",
      "山田 太郎 (テスト投稿者)",
      "鈴木 一郎 (テスト報告者)"
    );
    console.log("Email sent successfully!");
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

testEmail();
