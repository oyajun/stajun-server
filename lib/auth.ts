import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, bearer, anonymous, openAPI } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { prisma } from "./prisma";
import { sendOtpEmail } from "./resend";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      iconEmoji: {
        type: "string",
        input: true,
      },
      iconBackgroundColor: {
        type: "string",
        input: true,
      },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await prisma.$transaction([
          prisma.follow.deleteMany({
            where: { OR: [{ followerId: user.id }, { followingId: user.id }] },
          }),
          prisma.studySession.deleteMany({ where: { userId: user.id } }),
          prisma.studyPost.deleteMany({ where: { userId: user.id } }),
        ]);
      },
    },
  },
  advanced: {
    disableOriginCheck: true, // Required for native mobile clients (iOS/Android)
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await sendOtpEmail(email, otp);
      },
      changeEmail: {
        enabled: true
      }
    }),
    bearer(),
    dash(),
    anonymous(),
    openAPI()
  ],
});
