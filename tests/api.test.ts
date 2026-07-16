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
import * as users from "@/app/api/v1/users/route";
import * as follow from "@/app/api/v1/follow/[id]/route";
import * as following from "@/app/api/v1/following/[id]/route";
import * as followers from "@/app/api/v1/followers/[id]/route";
import * as ssStart from "@/app/api/v1/study-sessions/start/route";
import * as ssStop from "@/app/api/v1/study-sessions/stop/route";
import * as ssState from "@/app/api/v1/study-sessions/[id]/route";
import * as posts from "@/app/api/v1/posts/route";
import * as postId from "@/app/api/v1/posts/[id]/route";

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("認証・オンボーディングゲート", () => {
  it("トークン無しの保護ルートは401", async () => {
    const res = await ssState.GET(apiRequest("GET"), routeCtx({ id: "me" }));
    const { status } = await readResponse(res);
    expect(status).toBe(401);
  });

  it("オンボーディング未完了ユーザーは保護ルートで403", async () => {
    const u = await createUser(); // username=null
    const res = await ssState.GET(
      apiRequest("GET", { token: u.token }),
      routeCtx({ id: "me" }),
    );
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

describe("ユーザー検索（GET /users?q=）", () => {
  it("qが無い/空なら400", async () => {
    const me = await createUser({ username: "searcher0" });
    const r1 = await users.GET(apiRequest("GET", { token: me.token }));
    expect((await readResponse(r1)).status).toBe(400);
    const r2 = await users.GET(apiRequest("GET", { token: me.token, query: { q: "   " } }));
    const { status, body } = await readResponse(r2);
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_QUERY");
  });

  it("完全一致が先頭、その後に曖昧一致（username昇順）", async () => {
    const me = await createUser({ username: "searcher1" });
    // 完全一致
    const exact = await createUser({ username: "たろう" });
    // 部分一致（曖昧）2件 — 昇順確認のため意図的に逆順で作成
    const fuzzyB = await createUser({ username: "たろうＢ" });
    const fuzzyA = await createUser({ username: "たろうＡ" });
    // 無関係
    await createUser({ username: "はなこ" });

    const res = await users.GET(
      apiRequest("GET", { token: me.token, query: { q: "たろう" } }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    const ids = body.users.map((u: any) => u.id);
    expect(ids[0]).toBe(exact.id); // 完全一致が先頭
    // 続く曖昧一致は username 昇順（Ａ→Ｂ）
    expect(ids.indexOf(fuzzyA.id)).toBeLessThan(ids.indexOf(fuzzyB.id));
    expect(ids).toContain(fuzzyA.id);
    expect(ids).toContain(fuzzyB.id);
  });

  it("完全一致は大文字小文字を無視、自分自身は除外、isFollowingを含む", async () => {
    const me = await createUser({ username: "Alice-me" });
    const target = await createUser({ username: "BOB" });
    await follow.PUT(apiRequest("PUT", { token: me.token }), routeCtx({ id: target.id }));

    const res = await users.GET(
      apiRequest("GET", { token: me.token, query: { q: "bob" } }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    expect(body.users.some((u: any) => u.id === me.id)).toBe(false); // 自分は除外
    const hit = body.users.find((u: any) => u.id === target.id);
    expect(hit).toMatchObject({ username: "BOB", isFollowing: true });
  });

  it("該当なしは空配列", async () => {
    const me = await createUser({ username: "searcher2" });
    const res = await users.GET(
      apiRequest("GET", { token: me.token, query: { q: "zzz-no-match-xyz" } }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    expect(body.users).toEqual([]);
    expect(body.pagination).toMatchObject({ total: 0, hasMore: false });
  });

  it("limit/offsetでページング（完全一致→曖昧一致の順を跨いで割り当て）", async () => {
    const me = await createUser({ username: "pg-searcher" });
    // 論理順: [pgtest(完全一致), pgtest-a, pgtest-b, pgtest-c, pgtest-d]
    await createUser({ username: "pgtest" });
    await createUser({ username: "pgtest-c" });
    await createUser({ username: "pgtest-a" });
    await createUser({ username: "pgtest-d" });
    await createUser({ username: "pgtest-b" });

    const page = async (offset: number) => {
      const res = await users.GET(
        apiRequest("GET", {
          token: me.token,
          query: { q: "pgtest", limit: "2", offset: String(offset) },
        }),
      );
      return readResponse(res);
    };

    const p1 = await page(0);
    expect(p1.status).toBe(200);
    expect(p1.body.users.map((u: any) => u.username)).toEqual(["pgtest", "pgtest-a"]);
    expect(p1.body.pagination).toMatchObject({ total: 5, limit: 2, offset: 0, hasMore: true });

    const p2 = await page(2);
    expect(p2.body.users.map((u: any) => u.username)).toEqual(["pgtest-b", "pgtest-c"]);
    expect(p2.body.pagination).toMatchObject({ total: 5, offset: 2, hasMore: true });

    const p3 = await page(4);
    expect(p3.body.users.map((u: any) => u.username)).toEqual(["pgtest-d"]);
    expect(p3.body.pagination).toMatchObject({ total: 5, offset: 4, hasMore: false });
  });

  it("limitは最大50にクランプ、不正なlimit/offsetは既定にフォールバック", async () => {
    const me = await createUser({ username: "clamp-searcher" });
    const res = await users.GET(
      apiRequest("GET", {
        token: me.token,
        query: { q: "clamp-none", limit: "999", offset: "abc" },
      }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    expect(body.pagination).toMatchObject({ limit: 50, offset: 0 });
  });
});

describe("フォロー（PUT/DELETE /follow/:id, GET /following/:id）", () => {
  it("自分自身のフォローは400", async () => {
    const me = await createUser({ username: "self", iconEmoji: "🙂", iconBackgroundColor: "#FFF9C4" });
    const res = await follow.PUT(apiRequest("PUT", { token: me.token }), routeCtx({ id: me.id }));
    const { status, body } = await readResponse(res);
    expect(status).toBe(400);
    expect(body.error.code).toBe("CANNOT_FOLLOW_SELF");
  });

  it("フォローは冪等（2回目も200）で一覧・プロフィールに反映", async () => {
    const me = await createUser({ username: "follower", iconEmoji: "🙂", iconBackgroundColor: "#FFF9C4" });
    const target = await createUser({ username: "followee", iconEmoji: "😎", iconBackgroundColor: "#B2DFDB" });

    const r1 = await follow.PUT(apiRequest("PUT", { token: me.token }), routeCtx({ id: target.id }));
    expect((await readResponse(r1)).status).toBe(200);
    const r2 = await follow.PUT(apiRequest("PUT", { token: me.token }), routeCtx({ id: target.id }));
    const { status, body } = await readResponse(r2);
    expect(status).toBe(200);
    expect(body.isFollowing).toBe(true);

    const listRes = await following.GET(
      apiRequest("GET", { token: me.token }),
      routeCtx({ id: "me" }),
    );
    const list = await readResponse(listRes);
    expect(list.body.users.some((x: any) => x.id === target.id)).toBe(true);

    const profRes = await usersId.GET(apiRequest("GET", { token: me.token }), routeCtx({ id: target.id }));
    expect((await readResponse(profRes)).body.isFollowing).toBe(true);
  });

  it("フォロー解除は冪等（204）で一覧から消える", async () => {
    const me = await createUser({ username: "unfollower", iconEmoji: "🙂", iconBackgroundColor: "#FFF9C4" });
    const target = await createUser({ username: "unfollowee", iconEmoji: "😎", iconBackgroundColor: "#B2DFDB" });
    await follow.PUT(apiRequest("PUT", { token: me.token }), routeCtx({ id: target.id }));

    const d1 = await follow.DELETE(apiRequest("DELETE", { token: me.token }), routeCtx({ id: target.id }));
    expect((await readResponse(d1)).status).toBe(204);
    const d2 = await follow.DELETE(apiRequest("DELETE", { token: me.token }), routeCtx({ id: target.id }));
    expect((await readResponse(d2)).status).toBe(204);

    const listRes = await following.GET(
      apiRequest("GET", { token: me.token }),
      routeCtx({ id: "me" }),
    );
    const list = await readResponse(listRes);
    expect(list.body.users.length).toBe(0);
  });
});

describe("学習セッション", () => {
  it("start→409(二重)→me→feed→stop→404(再stop)の一連", async () => {
    const bob = await createUser({ username: "studier", iconEmoji: "🔥", iconBackgroundColor: "#FFCCBC" });
    const watcher = await createUser({ username: "watcher", iconEmoji: "👀", iconBackgroundColor: "#E1BEE7" });
    await follow.PUT(apiRequest("PUT", { token: watcher.token }), routeCtx({ id: bob.id }));

    const startRes = await ssStart.POST(apiRequest("POST", { token: bob.token }));
    const start = await readResponse(startRes);
    expect(start.status).toBe(201);
    expect(start.body.endedAt).toBeNull();

    const dupRes = await ssStart.POST(apiRequest("POST", { token: bob.token }));
    const dup = await readResponse(dupRes);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("ALREADY_STUDYING");

    const meRes = await ssState.GET(
      apiRequest("GET", { token: bob.token }),
      routeCtx({ id: "me" }),
    );
    expect((await readResponse(meRes)).body.isStudying).toBe(true);

    const feedRes = await following.GET(
      apiRequest("GET", { token: watcher.token }),
      routeCtx({ id: "me" }),
    );
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

describe("フォロワー一覧（GET /followers/:id）", () => {
  it(":id のフォロワーを返し、me エイリアスも使える", async () => {
    const target = await createUser({ username: "flwd", iconEmoji: "🎯", iconBackgroundColor: "#FFF9C4" });
    const fan = await createUser({ username: "flwr", iconEmoji: "📣", iconBackgroundColor: "#B2DFDB" });
    await follow.PUT(apiRequest("PUT", { token: fan.token }), routeCtx({ id: target.id }));

    // 他ユーザーidで取得
    const r1 = await followers.GET(
      apiRequest("GET", { token: target.token }),
      routeCtx({ id: target.id }),
    );
    const b1 = await readResponse(r1);
    expect(b1.status).toBe(200);
    expect(b1.body.users.some((u: any) => u.id === fan.id)).toBe(true);
    expect(b1.body.pagination).toMatchObject({ total: 1, hasMore: false });

    // me エイリアス（target 自身）
    const r2 = await followers.GET(
      apiRequest("GET", { token: target.token }),
      routeCtx({ id: "me" }),
    );
    const b2 = await readResponse(r2);
    expect(b2.body.users.some((u: any) => u.id === fan.id)).toBe(true);
  });

  it("存在しないユーザーのフォロワーは404", async () => {
    const me = await createUser({ username: "flw404" });
    const res = await followers.GET(
      apiRequest("GET", { token: me.token }),
      routeCtx({ id: "no-such-id" }),
    );
    expect((await readResponse(res)).status).toBe(404);
  });
});

describe("投稿（/posts）", () => {
  it("作成できる（コメント任意）", async () => {
    const u = await createUser({ username: "poster1", iconEmoji: "✍️", iconBackgroundColor: "#FFE0B2" });
    const res = await posts.POST(
      apiRequest("POST", { token: u.token, body: { minutes: 45, comment: "英文法おわり" } }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(201);
    expect(body).toMatchObject({ minutes: 45, comment: "英文法おわり" });
    expect(body.id).toBeTruthy();

    // コメント省略時は null
    const res2 = await posts.POST(
      apiRequest("POST", { token: u.token, body: { minutes: 10 } }),
    );
    const b2 = await readResponse(res2);
    expect(b2.status).toBe(201);
    expect(b2.body.comment).toBeNull();
  });

  it("minutesが範囲外/非整数は400", async () => {
    const u = await createUser({ username: "poster2" });
    for (const minutes of [0, 1441, 1.5, -3, "60"]) {
      const res = await posts.POST(
        apiRequest("POST", { token: u.token, body: { minutes } }),
      );
      const { status, body } = await readResponse(res);
      expect(status).toBe(400);
      expect(body.error.code).toBe("INVALID_MINUTES");
    }
  });

  it("commentが長すぎ/改行を含むと400", async () => {
    const u = await createUser({ username: "poster3" });
    const tooLong = "あ".repeat(501);
    const r1 = await posts.POST(
      apiRequest("POST", { token: u.token, body: { minutes: 30, comment: tooLong } }),
    );
    expect((await readResponse(r1)).body.error.code).toBe("INVALID_COMMENT");
    const r2 = await posts.POST(
      apiRequest("POST", { token: u.token, body: { minutes: 30, comment: "a\nb" } }),
    );
    expect((await readResponse(r2)).status).toBe(400);
  });

  it("ホームタイムラインは自分＋フォロー中のみ（新しい順）", async () => {
    const me = await createUser({ username: "tl-me", iconEmoji: "🏠", iconBackgroundColor: "#C8E6C9" });
    const followee = await createUser({ username: "tl-followee", iconEmoji: "🤝", iconBackgroundColor: "#B2DFDB" });
    const stranger = await createUser({ username: "tl-stranger", iconEmoji: "🚶", iconBackgroundColor: "#FFCDD2" });
    await follow.PUT(apiRequest("PUT", { token: me.token }), routeCtx({ id: followee.id }));

    const mine = await readResponse(
      await posts.POST(apiRequest("POST", { token: me.token, body: { minutes: 20 } })),
    );
    const followeePost = await readResponse(
      await posts.POST(apiRequest("POST", { token: followee.token, body: { minutes: 30 } })),
    );
    const strangerPost = await readResponse(
      await posts.POST(apiRequest("POST", { token: stranger.token, body: { minutes: 40 } })),
    );

    const res = await posts.GET(apiRequest("GET", { token: me.token }));
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    const ids = body.posts.map((p: any) => p.id);
    expect(ids).toContain(mine.body.id);
    expect(ids).toContain(followeePost.body.id);
    expect(ids).not.toContain(strangerPost.body.id);
    // 各投稿に投稿者情報が付く
    const followeeEntry = body.posts.find((p: any) => p.id === followeePost.body.id);
    expect(followeeEntry.user).toMatchObject({ id: followee.id, username: "tl-followee" });
    // 新しい順（followeePost は mine より後に作成）
    expect(ids.indexOf(followeePost.body.id)).toBeLessThan(ids.indexOf(mine.body.id));
  });

  it("userId指定で本人の投稿のみ取得（公開・me可）", async () => {
    const author = await createUser({ username: "prof-author", iconEmoji: "📖", iconBackgroundColor: "#D1C4E9" });
    const viewer = await createUser({ username: "prof-viewer", iconEmoji: "👓", iconBackgroundColor: "#FFF9C4" });
    const p = await readResponse(
      await posts.POST(apiRequest("POST", { token: author.token, body: { minutes: 25 } })),
    );

    // フォローしていない viewer でも公開で見られる
    const res = await posts.GET(
      apiRequest("GET", { token: viewer.token, query: { userId: author.id } }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    expect(body.posts.every((x: any) => x.userId === author.id)).toBe(true);
    expect(body.posts.some((x: any) => x.id === p.body.id)).toBe(true);

    // me エイリアス（author 自身）
    const meRes = await posts.GET(
      apiRequest("GET", { token: author.token, query: { userId: "me" } }),
    );
    const meBody = await readResponse(meRes);
    expect(meBody.body.posts.some((x: any) => x.id === p.body.id)).toBe(true);

    // 存在しないユーザーは404
    const nf = await posts.GET(
      apiRequest("GET", { token: viewer.token, query: { userId: "no-such-id" } }),
    );
    expect((await readResponse(nf)).status).toBe(404);
  });

  it("削除は本人のみ（他人は403・存在しないは404）", async () => {
    const owner = await createUser({ username: "del-owner", iconEmoji: "🗑️", iconBackgroundColor: "#FFCCBC" });
    const other = await createUser({ username: "del-other", iconEmoji: "🙅", iconBackgroundColor: "#B3E5FC" });
    const p = await readResponse(
      await posts.POST(apiRequest("POST", { token: owner.token, body: { minutes: 15 } })),
    );

    // 他人は403
    const forbidden = await postId.DELETE(
      apiRequest("DELETE", { token: other.token }),
      routeCtx({ id: p.body.id }),
    );
    expect((await readResponse(forbidden)).status).toBe(403);

    // 本人は204、以降は取得できない
    const del = await postId.DELETE(
      apiRequest("DELETE", { token: owner.token }),
      routeCtx({ id: p.body.id }),
    );
    expect((await readResponse(del)).status).toBe(204);

    const after = await posts.GET(
      apiRequest("GET", { token: owner.token, query: { userId: "me" } }),
    );
    const afterBody = await readResponse(after);
    expect(afterBody.body.posts.some((x: any) => x.id === p.body.id)).toBe(false);

    // 存在しない投稿は404
    const nf = await postId.DELETE(
      apiRequest("DELETE", { token: owner.token }),
      routeCtx({ id: p.body.id }),
    );
    expect((await readResponse(nf)).status).toBe(404);
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
