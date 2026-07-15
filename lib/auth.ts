import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, bearer } from "better-auth/plugins";
import { prisma } from "./prisma";
import { sendOtpEmail } from "./onesignal";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      username: {
        type: "string",
        input: true,
      },
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
        ]);
      },
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await sendOtpEmail(email, otp);
      },
    }),
    bearer(),
  ],
});
