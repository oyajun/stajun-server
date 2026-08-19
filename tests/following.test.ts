import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/following/[id]/route";
import { prisma } from "@/lib/prisma";
import * as apiModule from "@/lib/api";

describe("GET /api/v1/following/:id sorting", () => {
  it("sorts studying users first (studyingSince desc), then non-studying users by lastActiveAt desc (nulls last), then name asc, and does not return lastActiveAt", async () => {
    // 認証モック
    vi.spyOn(apiModule, "requireOnboardedUser").mockResolvedValue({
      user: { id: "user_me", name: "Me", email: "me@example.com" } as any,
    });
    vi.spyOn(apiModule, "resolveOnboardedUserId").mockResolvedValue("user_me");

    // ブロックモック（なし）
    vi.spyOn(prisma.block, "findMany").mockResolvedValue([] as any);

    // フォロー対象モック (6ユーザー)
    vi.spyOn(prisma.follow, "findMany").mockResolvedValue([
      { followingId: "u1" },
      { followingId: "u2" },
      { followingId: "u3" },
      { followingId: "u4" },
      { followingId: "u5" },
      { followingId: "u6" },
    ] as any);

    const now = Date.now();
    // ユーザー情報（lastActiveAt 含む）
    const mockUsers = [
      {
        id: "u1",
        name: "Zack (Active Recently)",
        iconEmoji: "😀",
        iconBackgroundColor: "#111111",
        lastActiveAt: new Date(now - 1000 * 60 * 5), // 5分前
      },
      {
        id: "u2",
        name: "Alice (Active Long Ago)",
        iconEmoji: "😃",
        iconBackgroundColor: "#222222",
        lastActiveAt: new Date(now - 1000 * 60 * 60 * 24), // 1日前
      },
      {
        id: "u3",
        name: "Charlie (Null Active B)",
        iconEmoji: "😄",
        iconBackgroundColor: "#333333",
        lastActiveAt: null,
      },
      {
        id: "u4",
        name: "Bob (Null Active A)",
        iconEmoji: "😁",
        iconBackgroundColor: "#444444",
        lastActiveAt: null,
      },
      {
        id: "u5",
        name: "Study Newer",
        iconEmoji: "😆",
        iconBackgroundColor: "#555555",
        lastActiveAt: new Date(now - 1000 * 60 * 10),
      },
      {
        id: "u6",
        name: "Study Older",
        iconEmoji: "😅",
        iconBackgroundColor: "#666666",
        lastActiveAt: new Date(now - 1000 * 60 * 2), // lastActiveAt は新しいが、勉強開始は古い
      },
    ];

    vi.spyOn(prisma.user, "findMany").mockResolvedValue(mockUsers as any);

    // annotateUsers のモック: u5, u6 が勉強中
    vi.spyOn(apiModule, "annotateUsers").mockImplementation(async (viewerId, rows) => {
      return rows.map((r) => {
        let isStudying = false;
        let studyingSince: Date | null = null;
        if (r.id === "u5") {
          isStudying = true;
          studyingSince = new Date(now - 1000 * 60 * 10); // 10分前開始 (新しい)
        } else if (r.id === "u6") {
          isStudying = true;
          studyingSince = new Date(now - 1000 * 60 * 60); // 1時間前開始 (古い)
        }
        return {
          id: r.id,
          name: r.name || "名無し",
          iconEmoji: r.iconEmoji || "👤",
          iconBackgroundColor: r.iconBackgroundColor || "#CCCCCC",
          isFollowing: true,
          muteStudyStartNotification: 0,
          isMuted: false,
          isStudying,
          studyingSince,
        };
      });
    });

    const req = new Request("http://localhost/api/v1/following/me");
    const ctx = { params: Promise.resolve({ id: "me" }) };
    const res = await GET(req, ctx as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    const resultIds = body.users.map((u: any) => u.id);

    // 期待する順序:
    // 1. u5 (勉強中・10分前開始)
    // 2. u6 (勉強中・1時間前開始)
    // 3. u1 (非勉強中・lastActiveAt 5分前)
    // 4. u2 (非勉強中・lastActiveAt 1日前)
    // 5. u4 (非勉強中・lastActiveAt null, name: Bob)
    // 6. u3 (非勉強中・lastActiveAt null, name: Charlie)
    expect(resultIds).toEqual(["u5", "u6", "u1", "u2", "u4", "u3"]);

    // lastActiveAt がレスポンスに含まれていないことを検証
    for (const u of body.users) {
      expect(u).not.toHaveProperty("lastActiveAt");
    }
  });

  it("handles same lastActiveAt with name alphabetical fallback", async () => {
    vi.spyOn(apiModule, "requireOnboardedUser").mockResolvedValue({
      user: { id: "user_me", name: "Me", email: "me@example.com" } as any,
    });
    vi.spyOn(apiModule, "resolveOnboardedUserId").mockResolvedValue("user_me");
    vi.spyOn(prisma.block, "findMany").mockResolvedValue([] as any);

    vi.spyOn(prisma.follow, "findMany").mockResolvedValue([
      { followingId: "u1" },
      { followingId: "u2" },
    ] as any);

    const sameTime = new Date("2026-08-20T00:00:00Z");
    const mockUsers = [
      {
        id: "u1",
        name: "Zachary",
        iconEmoji: "😀",
        iconBackgroundColor: "#111111",
        lastActiveAt: sameTime,
      },
      {
        id: "u2",
        name: "Aaron",
        iconEmoji: "😃",
        iconBackgroundColor: "#222222",
        lastActiveAt: sameTime,
      },
    ];

    vi.spyOn(prisma.user, "findMany").mockResolvedValue(mockUsers as any);
    vi.spyOn(apiModule, "annotateUsers").mockImplementation(async (viewerId, rows) => {
      return rows.map((r) => ({
        id: r.id,
        name: r.name || "名無し",
        iconEmoji: r.iconEmoji || "👤",
        iconBackgroundColor: r.iconBackgroundColor || "#CCCCCC",
        isFollowing: true,
        muteStudyStartNotification: 0,
        isMuted: false,
        isStudying: false,
        studyingSince: null,
      }));
    });

    const req = new Request("http://localhost/api/v1/following/me");
    const ctx = { params: Promise.resolve({ id: "me" }) };
    const res = await GET(req, ctx as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    const resultIds = body.users.map((u: any) => u.id);

    // Aaron (u2) before Zachary (u1)
    expect(resultIds).toEqual(["u2", "u1"]);
  });

  it("returns empty array when user is following no one", async () => {
    vi.spyOn(apiModule, "requireOnboardedUser").mockResolvedValue({
      user: { id: "user_me", name: "Me", email: "me@example.com" } as any,
    });
    vi.spyOn(apiModule, "resolveOnboardedUserId").mockResolvedValue("user_me");
    vi.spyOn(prisma.block, "findMany").mockResolvedValue([] as any);
    vi.spyOn(prisma.follow, "findMany").mockResolvedValue([]);

    const req = new Request("http://localhost/api/v1/following/me");
    const ctx = { params: Promise.resolve({ id: "me" }) };
    const res = await GET(req, ctx as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual([]);
  });
});
