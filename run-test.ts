import 'dotenv/config';
import { POST } from './app/api/v1/posts/[id]/report/route';
import { prisma } from './lib/prisma';

async function main() {
  console.log("Creating test users and post...");
  const posterId = "test_poster_" + Date.now();
  const reporterId = "test_reporter_" + Date.now();

  const poster = await prisma.user.create({
    data: {
      id: posterId,
      name: "山田（投稿者）",
      email: `poster_${Date.now()}@example.com`,
    }
  });

  const reporter = await prisma.user.create({
    data: {
      id: reporterId,
      name: "鈴木（報告者）",
      email: `reporter_${Date.now()}@example.com`,
    }
  });

  const sessionToken = "test_token_" + Date.now();
  await prisma.session.create({
    data: {
      id: "sess_" + Date.now(),
      userId: reporter.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    }
  });

  const post = await prisma.studyPost.create({
    data: {
      id: "test_post_" + Date.now(),
      userId: poster.id,
      minutes: 45,
      comment: "これはテスト投稿です。不適切な内容を含んでいるため報告されます。",
    }
  });

  console.log(`Created Post: ${post.id}`);

  // Create a mock Request
  const req = new Request(`http://localhost:3000/api/v1/posts/${post.id}/report`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${sessionToken}`
    }
  });

  const ctx = { params: Promise.resolve({ id: post.id }) };
  
  console.log("Calling POST handler to report the post...");
  const response = await POST(req, ctx as any);
  
  console.log("Response status:", response.status);
  
  // Clean up
  console.log("Cleaning up test data...");
  await prisma.studyPost.delete({ where: { id: post.id } });
  await prisma.session.delete({ where: { token: sessionToken } });
  await prisma.user.delete({ where: { id: reporter.id } });
  await prisma.user.delete({ where: { id: poster.id } });
  
  console.log("Test finished!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
