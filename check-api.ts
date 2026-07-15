import { auth } from './lib/auth';

console.log(Object.keys(auth.api).filter(k => k.toLowerCase().includes('otp') || k.toLowerCase().includes('email')));
