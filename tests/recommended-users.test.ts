import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/users/recommended/route";
import { isValidComment } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  apiRequest,
  cleanupTestData,
  createUser,
  readResponse,
  type TestUser,
} from "./helpers";

describe("GET /api/v1/users/recommended", () => {
  let me: TestUser;

  beforeEach(async () => {
    await cleanupTestData();
    me = await createUser({ name: "myself" });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("未認証リクエストは 401 を返す", async () => {
    const res = await GET(apiRequest("GET"));
    const { status, body } = await readResponse(res);
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("今勉強中のユーザーが優先され、最新投稿・テストアカウント除外・フォロー済み除外が正しく動作する", async () => {
    // 1. 勉強中の未フォローユーザー (2人)
    const studyingUser1 = await createUser({ name: "studying_user_1" });
    const studyingUser2 = await createUser({ name: "studying_user_2" });

    const now = new Date();
    await prisma.studySession.create({
      data: {
        userId: studyingUser1.id,
        startedAt: new Date(now.getTime() - 10 * 60 * 1000), // 10分前開始
      },
    });
    await prisma.studySession.create({
      data: {
        userId: studyingUser2.id,
        startedAt: new Date(now.getTime() - 5 * 60 * 1000), // 5分前開始（こちらが最近）
      },
    });

    // 2. 既にフォロー中の勉強中ユーザー (おすすめから除外されるべき)
    const followedStudyingUser = await createUser({ name: "followed_studying" });
    await prisma.follow.create({
      data: { followerId: me.id, followingId: followedStudyingUser.id },
    });
    await prisma.studySession.create({
      data: { userId: followedStudyingUser.id, startedAt: now },
    });

    // 3. テスト用メールアドレスの勉強中ユーザー (おすすめから除外されるべき)
    const testEmailUser = await createUser({ name: "test_email_user" });
    await prisma.user.update({
      where: { id: testEmailUser.id },
      data: { email: "test+1000@oyajun.com" },
    });
    await prisma.studySession.create({
      data: { userId: testEmailUser.id, startedAt: now },
    });

    // 4. 投稿がある未フォローユーザー (穴埋め用)
    const postingUser1 = await createUser({ name: "posting_user_1" });
    const postingUser2 = await createUser({ name: "posting_user_2" });

    await prisma.studyPost.create({
      data: {
        userId: postingUser1.id,
        minutes: 30,
        createdAt: new Date(now.getTime() - 1000),
      },
    });
    await prisma.studyPost.create({
      data: {
        userId: postingUser2.id,
        minutes: 45,
        createdAt: new Date(now.getTime() - 500), // こちらが投稿が最近
      },
    });

    // リクエスト実行
    const res = await GET(apiRequest("GET", { token: me.token }));
    const { status, body } = await readResponse(res);

    expect(status).toBe(200);
    expect(body.users).toBeDefined();

    const returnedIds = body.users.map((u: any) => u.id);

    // 勉強中のユーザー2人（studyingUser2, studyingUser1の順）が先頭に来ているか
    expect(returnedIds.slice(0, 2)).toEqual([studyingUser2.id, studyingUser1.id]);
    expect(body.users[0].isStudying).toBe(true);
    expect(body.users[1].isStudying).toBe(true);

    // 穴埋めとして postingUser2, postingUser1 の順で入っているか
    expect(returnedIds.slice(2, 4)).toEqual([postingUser2.id, postingUser1.id]);
    expect(body.users[2].isStudying).toBe(false);

    // 除外されるべきユーザーが含まれていないか
    expect(returnedIds).not.toContain(me.id);
    expect(returnedIds).not.toContain(followedStudyingUser.id);
    expect(returnedIds).not.toContain(testEmailUser.id);
  });

  it("ブロック関係のユーザーが除外される", async () => {
    const blockedUser = await createUser({ name: "blocked_user" });
    await prisma.block.create({
      data: { blockerId: me.id, blockedId: blockedUser.id },
    });
    await prisma.studySession.create({
      data: { userId: blockedUser.id, startedAt: new Date() },
    });

    const res = await GET(apiRequest("GET", { token: me.token }));
    const { status, body } = await readResponse(res);

    expect(status).toBe(200);
    const returnedIds = body.users.map((u: any) => u.id);
    expect(returnedIds).not.toContain(blockedUser.id);
  });
});

describe("isValidComment", () => {
  it("コメントは50文字を超えると無効になる", () => {
    expect(isValidComment("a".repeat(50))).toBe(true);
    expect(isValidComment("a".repeat(51))).toBe(false);
  });
});
