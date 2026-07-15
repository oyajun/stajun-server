import { sendOtpEmail } from './lib/resend';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Email argument is required');
    process.exit(1);
  }
  
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set in .env');
    process.exit(1);
  }

  console.log(`Sending test OTP to ${email}...`);
  try {
    await sendOtpEmail(email, '123456');
    console.log('Success!');
  } catch (err) {
    console.error('Failed:', err);
  }
}

main();
