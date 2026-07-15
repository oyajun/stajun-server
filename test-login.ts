import { auth } from './lib/auth';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Email argument is required');
    process.exit(1);
  }
  
  console.log(`Starting real login process (send OTP) for ${email}...`);
  try {
    const res = await auth.api.sendVerificationOTP({
      body: {
        email: email,
        type: 'sign-in', // better-auth通常の実装
      }
    });
    console.log('OTP send initiated successfully. Check your email for the actual OTP!');
    console.log('Response:', res);
  } catch (err) {
    console.error('Failed to send OTP:', err);
  }
}

main();
