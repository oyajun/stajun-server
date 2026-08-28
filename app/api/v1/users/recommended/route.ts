import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { isUserPro, requireOnboardedUser, studyingSinceThreshold } from "@/lib/api";

const RECOMMENDED_LIMIT = 10;

/**
 * GET /api/v1/users/recommended — おすすめユーザー一覧の取得（最大10人）
 * 
 * 1. 今勉強中の未フォローユーザーを勉強開始日時（startedAt desc）順に優先して取得（最大10人）。
 * 2. 10人に満たない場合、最新の投稿日時が新しい順（StudyPost.createdAt desc）で補填。
 * 3. それでも満たない場合、登録日時が新しい順（User.createdAt desc）で補填。
 * 
 * 除外条件:
 * - 自分自身 (me)
 * - オンボーディング未完了 (name IS NULL)
 * - 既にフォロー中のユーザー
 * - ブロック関係にあるユーザー (自分がブロック中、または自分をブロック中)
 * - テストアカウント (email が test+... または test%@oyajun.com)
 */
export async function GET(request: Request) {
  const authed = await requireOnboardedUser(request);
  if (authed instanceof Response) return authed;
  const { user } = authed;

  // 1. ブロック関係にあるユーザーIDを取得
  const blocks = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: user.id }, { blockedId: user.id }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const blockedIds = blocks.map((b) =>
    b.blockerId === user.id ? b.blockedId : b.blockerId
  );

  // 2. 既にフォローしているユーザーIDを取得
  const follows = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followingId: true },
  });
  const followingIds = follows.map((f) => f.followingId);

  // 除外対象ID（自分自身 + ブロック関係 + フォロー中）
  const excludedIds = Array.from(
    new Set([user.id, ...blockedIds, ...followingIds])
  );

  // ユーザーの共通検索条件（名前または背景色が未設定のユーザー、およびテストユーザーを除外）
  const baseUserWhere: Prisma.UserWhereInput = {
    id: { notIn: excludedIds },
    name: { not: null },
    iconBackgroundColor: { not: null },
    NOT: [
      { email: { startsWith: "test+", mode: "insensitive" } },
      {
        email: {
          startsWith: "test",
          mode: "insensitive",
          endsWith: "@oyajun.com",
        },
      },
    ],
  };

  // -------------------------------------------------------------
  // ステップ1: 今勉強中のユーザー（startedAtが24時間以内）を最近順に最大10人取得
  // -------------------------------------------------------------
  const threshold = studyingSinceThreshold();
  const activeSessions = await prisma.studySession.findMany({
    where: {
      startedAt: { gt: threshold },
      user: baseUserWhere,
    },
    orderBy: { startedAt: "desc" },
    take: RECOMMENDED_LIMIT,
    select: {
      startedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          iconEmoji: true,
          iconBackgroundColor: true,
          isPro: true,
          proExpiresAt: true,
        },
      },
    },
  });

  const recommendedList: {
    id: string;
    name: string;
    iconEmoji: string | null;
    iconBackgroundColor: string | null;
    isPro: boolean;
    isStudying: boolean;
    studyingSince: Date | null;
  }[] = activeSessions.map((s) => ({
    id: s.user.id,
    name: s.user.name ?? "名無し",
    iconEmoji: s.user.iconEmoji ?? null,
    iconBackgroundColor: s.user.iconBackgroundColor ?? null,
    isPro: isUserPro(s.user),
    isStudying: true,
    studyingSince: s.startedAt,
  }));

  const selectedUserIds = new Set(recommendedList.map((u) => u.id));

  // -------------------------------------------------------------
  // ステップ2: 10人に満たない場合、最新の投稿が新しい順で穴埋め
  // -------------------------------------------------------------
  const remaining = RECOMMENDED_LIMIT - recommendedList.length;
  if (remaining > 0) {
    const step2ExcludedIds = [...excludedIds, ...Array.from(selectedUserIds)];
    const step2UserWhere: Prisma.UserWhereInput = {
      ...baseUserWhere,
      id: { notIn: step2ExcludedIds },
    };

    // 最新の StudyPost から未選択ユーザーの投稿を新しい順に取得
    const recentPosts = await prisma.studyPost.findMany({
      where: {
        user: step2UserWhere,
      },
      orderBy: { createdAt: "desc" },
      take: remaining * 5,
      select: {
        user: {
          select: {
            id: true,
            name: true,
            iconEmoji: true,
            iconBackgroundColor: true,
            isPro: true,
            proExpiresAt: true,
          },
        },
      },
    });

    for (const post of recentPosts) {
      if (recommendedList.length >= RECOMMENDED_LIMIT) break;
      if (!selectedUserIds.has(post.user.id)) {
        selectedUserIds.add(post.user.id);
        recommendedList.push({
          id: post.user.id,
          name: post.user.name ?? "名無し",
          iconEmoji: post.user.iconEmoji ?? null,
          iconBackgroundColor: post.user.iconBackgroundColor ?? null,
          isPro: isUserPro(post.user),
          isStudying: false,
          studyingSince: null,
        });
      }
    }

    // まだ10人に満たない場合（投稿のないユーザー）、登録日時の新しい順で補填
    const stillRemaining = RECOMMENDED_LIMIT - recommendedList.length;
    if (stillRemaining > 0) {
      const fallbackUsers = await prisma.user.findMany({
        where: {
          ...baseUserWhere,
          id: { notIn: [...excludedIds, ...Array.from(selectedUserIds)] },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: stillRemaining,
        select: {
          id: true,
          name: true,
          iconEmoji: true,
          iconBackgroundColor: true,
          isPro: true,
          proExpiresAt: true,
        },
      });

      for (const u of fallbackUsers) {
        selectedUserIds.add(u.id);
        recommendedList.push({
          id: u.id,
          name: u.name ?? "名無し",
          iconEmoji: u.iconEmoji ?? null,
          iconBackgroundColor: u.iconBackgroundColor ?? null,
          isPro: isUserPro(u),
          isStudying: false,
          studyingSince: null,
        });
      }
    }
  }

  return Response.json({
    users: recommendedList.map((u) => ({
      id: u.id,
      name: u.name,
      iconEmoji: u.iconEmoji,
      iconBackgroundColor: u.iconBackgroundColor,
      isPro: u.isPro,
      isFollowing: false,
      isStudying: u.isStudying,
      studyingSince: u.studyingSince ? u.studyingSince.toISOString() : null,
    })),
  });
}
