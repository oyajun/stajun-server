import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  apiRequest,
  cleanupTestData,
  createUser,
  readResponse,
  routeCtx,
} from "./helpers";

import * as usersMe from "@/app/api/v1/users/me/route";
import * as usersId from "@/app/api/v1/users/[id]/route";
import * as follow from "@/app/api/v1/users/[id]/follow/route";
import * as following from "@/app/api/v1/me/following/route";
import * as ssStart from "@/app/api/v1/study-sessions/start/route";
import * as ssStop from "@/app/api/v1/study-sessions/stop/route";
import * as ssMe from "@/app/api/v1/study-sessions/me/route";
import * as feed from "@/app/api/v1/home/feed/route";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("認証・オンボーディングゲート", () => {
  it("トークン無しの保護ルートは401", async () => {
    const res = await ssMe.GET(apiRequest("GET"));
    const { status } = await readResponse(res);
    expect(status).toBe(401);
  });

  it("オンボーディング未完了ユーザーは保護ルートで403", async () => {
    const u = await createUser(); // username=null
    const res = await ssMe.GET(apiRequest("GET", { token: u.token }));
    const { status, body } = await readResponse(res);
    expect(status).toBe(403);
    expect(body.error.code).toBe("ONBOARDING_REQUIRED");
  });
});

describe("オンボーディング（POST /users/me）", () => {
  it("未完了ユーザーは登録できて201", async () => {
    const u = await createUser();
    const res = await usersMe.POST(
      apiRequest("POST", {
        token: u.token,
        body: { username: "alice", iconEmoji: "📚", iconBackgroundColor: "#FFD54F" },
      }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(201);
    expect(body).toMatchObject({ id: u.id, username: "alice", iconEmoji: "📚" });
  });

  it("日本語のusernameも許可される", async () => {
    const u = await createUser();
    const res = await usersMe.POST(
      apiRequest("POST", {
        token: u.token,
        body: { username: "田中太郎", iconEmoji: "🐣", iconBackgroundColor: "#B3E5FC" },
      }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(201);
    expect(body.username).toBe("田中太郎");
  });

  it("空白のみのusernameは400", async () => {
    const u = await createUser();
    const res = await usersMe.POST(
      apiRequest("POST", {
        token: u.token,
        body: { username: "   ", iconEmoji: "📚", iconBackgroundColor: "#FFD54F" },
      }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_USERNAME");
  });

  it("登録済みユーザーの再登録は409", async () => {
    const u = await createUser({ username: "bob", iconEmoji: "🔥", iconBackgroundColor: "#FFCCBC" });
    const res = await usersMe.POST(
      apiRequest("POST", {
        token: u.token,
        body: { username: "bob2", iconEmoji: "📚", iconBackgroundColor: "#FFD54F" },
      }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(409);
    expect(body.error.code).toBe("ALREADY_ONBOARDED");
  });
});

describe("プロフィール（GET/PATCH /users/me）", () => {
  it("自分のプロフィールを取得できる", async () => {
    const u = await createUser({ username: "carol", iconEmoji: "🐱", iconBackgroundColor: "#C8E6C9" });
    const res = await usersMe.GET(apiRequest("GET", { token: u.token }));
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: u.id, username: "carol", iconEmoji: "🐱" });
  });

  it("部分更新できる", async () => {
    const u = await createUser({ username: "dave", iconEmoji: "🐶", iconBackgroundColor: "#FFE0B2" });
    const res = await usersMe.PATCH(apiRequest("PATCH", { token: u.token, body: { iconEmoji: "✏️" } }));
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    expect(body.iconEmoji).toBe("✏️");
  });

  it("不正なcolorは400", async () => {
    const u = await createUser({ username: "erin", iconEmoji: "🐰", iconBackgroundColor: "#FFFFFF" });
    const res = await usersMe.PATCH(apiRequest("PATCH", { token: u.token, body: { iconBackgroundColor: "red" } }));
    const { status } = await readResponse(res);
    expect(status).toBe(400);
  });

  it("更新フィールドが無いと400 NO_FIELDS", async () => {
    const u = await createUser({ username: "fay", iconEmoji: "🐭", iconBackgroundColor: "#D1C4E9" });
    const res = await usersMe.PATCH(apiRequest("PATCH", { token: u.token, body: {} }));
    const { status, body } = await readResponse(res);
    expect(status).toBe(400);
    expect(body.error.code).toBe("NO_FIELDS");
  });
});

describe("公開プロフィール（GET /users/:id）", () => {
  it("idで他ユーザーを取得（未フォロー・未勉強）", async () => {
    const me = await createUser({ username: "me1", iconEmoji: "🙂", iconBackgroundColor: "#FFF9C4" });
    const other = await createUser({ username: "other1", iconEmoji: "😎", iconBackgroundColor: "#B2DFDB" });
    const res = await usersId.GET(apiRequest("GET", { token: me.token }), routeCtx({ id: other.id }));
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: other.id, username: "other1", isFollowing: false, isStudying: false });
    expect(body.studyingSince).toBeNull();
  });

  it("存在しないidは404", async () => {
    const me = await createUser({ username: "me2", iconEmoji: "🙂", iconBackgroundColor: "#FFF9C4" });
    const res = await usersId.GET(apiRequest("GET", { token: me.token }), routeCtx({ id: "no-such-id" }));
    const { status } = await readResponse(res);
    expect(status).toBe(404);
  });

  it("オンボーディング未完了ユーザーのidは404扱い", async () => {
    const me = await createUser({ username: "me3", iconEmoji: "🙂", iconBackgroundColor: "#FFF9C4" });
    const halfUser = await createUser(); // username=null
    const res = await usersId.GET(apiRequest("GET", { token: me.token }), routeCtx({ id: halfUser.id }));
    const { status } = await readResponse(res);
    expect(status).toBe(404);
  });
});

describe("フォロー（/users/:id/follow）", () => {
  it("自分自身のフォローは400", async () => {
    const me = await createUser({ username: "self", iconEmoji: "🙂", iconBackgroundColor: "#FFF9C4" });
    const res = await follow.POST(apiRequest("POST", { token: me.token }), routeCtx({ id: me.id }));
    const { status, body } = await readResponse(res);
    expect(status).toBe(400);
    expect(body.error.code).toBe("CANNOT_FOLLOW_SELF");
  });

  it("フォローは冪等（2回目も200）で一覧・プロフィールに反映", async () => {
    const me = await createUser({ username: "follower", iconEmoji: "🙂", iconBackgroundColor: "#FFF9C4" });
    const target = await createUser({ username: "followee", iconEmoji: "😎", iconBackgroundColor: "#B2DFDB" });

    const r1 = await follow.POST(apiRequest("POST", { token: me.token }), routeCtx({ id: target.id }));
    expect((await readResponse(r1)).status).toBe(200);
    const r2 = await follow.POST(apiRequest("POST", { token: me.token }), routeCtx({ id: target.id }));
    const { status, body } = await readResponse(r2);
    expect(status).toBe(200);
    expect(body.isFollowing).toBe(true);

    const listRes = await following.GET(apiRequest("GET", { token: me.token }));
    const list = await readResponse(listRes);
    expect(list.body.users.some((x: any) => x.id === target.id)).toBe(true);

    const profRes = await usersId.GET(apiRequest("GET", { token: me.token }), routeCtx({ id: target.id }));
    expect((await readResponse(profRes)).body.isFollowing).toBe(true);
  });

  it("フォロー解除は冪等（204）で一覧から消える", async () => {
    const me = await createUser({ username: "unfollower", iconEmoji: "🙂", iconBackgroundColor: "#FFF9C4" });
    const target = await createUser({ username: "unfollowee", iconEmoji: "😎", iconBackgroundColor: "#B2DFDB" });
    await follow.POST(apiRequest("POST", { token: me.token }), routeCtx({ id: target.id }));

    const d1 = await follow.DELETE(apiRequest("DELETE", { token: me.token }), routeCtx({ id: target.id }));
    expect((await readResponse(d1)).status).toBe(204);
    const d2 = await follow.DELETE(apiRequest("DELETE", { token: me.token }), routeCtx({ id: target.id }));
    expect((await readResponse(d2)).status).toBe(204);

    const listRes = await following.GET(apiRequest("GET", { token: me.token }));
    const list = await readResponse(listRes);
    expect(list.body.users.length).toBe(0);
  });
});

describe("学習セッション", () => {
  it("start→409(二重)→me→feed→stop→404(再stop)の一連", async () => {
    const bob = await createUser({ username: "studier", iconEmoji: "🔥", iconBackgroundColor: "#FFCCBC" });
    const watcher = await createUser({ username: "watcher", iconEmoji: "👀", iconBackgroundColor: "#E1BEE7" });
    await follow.POST(apiRequest("POST", { token: watcher.token }), routeCtx({ id: bob.id }));

    const startRes = await ssStart.POST(apiRequest("POST", { token: bob.token }));
    const start = await readResponse(startRes);
    expect(start.status).toBe(201);
    expect(start.body.endedAt).toBeNull();

    const dupRes = await ssStart.POST(apiRequest("POST", { token: bob.token }));
    const dup = await readResponse(dupRes);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("ALREADY_STUDYING");

    const meRes = await ssMe.GET(apiRequest("GET", { token: bob.token }));
    expect((await readResponse(meRes)).body.isStudying).toBe(true);

    const feedRes = await feed.GET(apiRequest("GET", { token: watcher.token }));
    const feedBody = await readResponse(feedRes);
    const bobInFeed = feedBody.body.users.find((x: any) => x.id === bob.id);
    expect(bobInFeed?.isStudying).toBe(true);
    expect(bobInFeed?.studyingSince).toBeTruthy();

    const stopRes = await ssStop.POST(apiRequest("POST", { token: bob.token }));
    const stop = await readResponse(stopRes);
    expect(stop.status).toBe(200);
    expect(stop.body.endedAt).toBeTruthy();

    const stopAgainRes = await ssStop.POST(apiRequest("POST", { token: bob.token }));
    const stopAgain = await readResponse(stopAgainRes);
    expect(stopAgain.status).toBe(404);
    expect(stopAgain.body.error.code).toBe("NO_ACTIVE_SESSION");
  });
});

describe("アカウント削除（DELETE /users/me）", () => {
  it("非フレッシュセッションは403 SESSION_NOT_FRESH", async () => {
    const u = await createUser({
      username: "stale",
      iconEmoji: "🕰️",
      iconBackgroundColor: "#CFD8DC",
      sessionAgeDays: 2, // freshAge(1日)より古い
    });
    const res = await usersMe.DELETE(apiRequest("DELETE", { token: u.token }));
    const { status, body } = await readResponse(res);
    expect(status).toBe(403);
    expect(body.error.code).toBe("SESSION_NOT_FRESH");
  });

  it("フレッシュセッションは削除でき、以降は401", async () => {
    const u = await createUser({ username: "byebye", iconEmoji: "👋", iconBackgroundColor: "#FFCDD2" });
    const delRes = await usersMe.DELETE(apiRequest("DELETE", { token: u.token }));
    expect((await readResponse(delRes)).status).toBe(204);

    const afterRes = await usersMe.GET(apiRequest("GET", { token: u.token }));
    expect((await readResponse(afterRes)).status).toBe(401);
  });
});
