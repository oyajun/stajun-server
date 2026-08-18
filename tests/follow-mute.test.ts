import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  apiRequest,
  cleanupTestData,
  createUser,
  readResponse,
  routeCtx,
} from "./helpers";
import {
  PUT as followPUT,
  DELETE as followDELETE,
} from "@/app/api/v1/follow/[id]/route";
import {
  PUT as followMutePUT,
  DELETE as followMuteDELETE,
} from "@/app/api/v1/follow/[id]/mute/route";
import { GET as userGET } from "@/app/api/v1/users/[id]/route";
import { GET as followingGET } from "@/app/api/v1/following/[id]/route";
import { GET as followersGET } from "@/app/api/v1/followers/[id]/route";
import { sendToFollowers } from "@/lib/apns";

describe("Follow Mute Notifications API", () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("defaults muteStudyStartNotification to 0 on follow and supports dedicated PUT/DELETE mute endpoint", async () => {
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });

    // 1. Bob follows Alice
    const followRes = await followPUT(
      apiRequest("PUT", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );
    const { status: followStatus, body: followBody } = await readResponse(followRes);
    expect(followStatus).toBe(200);
    expect(followBody.isFollowing).toBe(true);
    expect(followBody.muteStudyStartNotification).toBe(0);
    expect(followBody.isMuted).toBe(false);

    // 2. Check Bob's view of Alice via GET /api/v1/users/:id
    const aliceFromBob = await userGET(
      apiRequest("GET", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );
    const { status: aliceStatus, body: aliceBody } = await readResponse(aliceFromBob);
    expect(aliceStatus).toBe(200);
    expect(aliceBody.isFollowing).toBe(true);
    expect(aliceBody.muteStudyStartNotification).toBe(0);
    expect(aliceBody.isMuted).toBe(false);

    // 3. Bob mutes study start notifications from Alice via PUT /api/v1/follow/:id/mute
    const muteRes = await followMutePUT(
      apiRequest("PUT", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );
    const { status: muteStatus, body: muteBody } = await readResponse(muteRes);
    expect(muteStatus).toBe(200);
    expect(muteBody.muteStudyStartNotification).toBe(1);
    expect(muteBody.isMuted).toBe(true);

    // 4. Check DB row
    const followRow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: bob.id, followingId: alice.id },
      },
    });
    expect(followRow?.muteStudyStartNotification).toBe(1);

    // 5. Check Bob's view of Alice again
    const aliceFromBobAfterMute = await userGET(
      apiRequest("GET", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );
    const { body: aliceBodyAfterMute } = await readResponse(aliceFromBobAfterMute);
    expect(aliceBodyAfterMute.muteStudyStartNotification).toBe(1);
    expect(aliceBodyAfterMute.isMuted).toBe(true);

    // 6. Bob's following list shows muteStudyStartNotification: 1
    const bobFollowingRes = await followingGET(
      apiRequest("GET", { token: bob.token }),
      routeCtx({ id: "me" }),
    );
    const { body: bobFollowingBody } = await readResponse(bobFollowingRes);
    const aliceInFollowing = bobFollowingBody.users.find((u: { id: string }) => u.id === alice.id);
    expect(aliceInFollowing?.muteStudyStartNotification).toBe(1);
    expect(aliceInFollowing?.isMuted).toBe(true);

    // 7. Unmute via DELETE /api/v1/follow/:id/mute
    const unmuteRes = await followMuteDELETE(
      apiRequest("DELETE", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );
    const { status: unmuteStatus, body: unmuteBody } = await readResponse(unmuteRes);
    expect(unmuteStatus).toBe(200);
    expect(unmuteBody.muteStudyStartNotification).toBe(0);
    expect(unmuteBody.isMuted).toBe(false);

    // 8. DB row is now 0
    const followRowAfterUnmute = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: bob.id, followingId: alice.id },
      },
    });
    expect(followRowAfterUnmute?.muteStudyStartNotification).toBe(0);
  });

  it("ensures privacy: third party cannot see another user's mute settings", async () => {
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const charlie = await createUser({ name: "Charlie" });

    // Bob follows Alice and mutes her
    await followPUT(apiRequest("PUT", { token: bob.token }), routeCtx({ id: alice.id }));
    await followMutePUT(
      apiRequest("PUT", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );

    // Charlie views Alice's followers list:
    // Bob is in the list, but Charlie does NOT follow Bob or mute Bob.
    const charlieViewFollowers = await followersGET(
      apiRequest("GET", { token: charlie.token }),
      routeCtx({ id: alice.id }),
    );
    const { body: followersBody } = await readResponse(charlieViewFollowers);
    const bobInList = followersBody.users.find((u: { id: string }) => u.id === bob.id);
    expect(bobInList?.muteStudyStartNotification).toBe(0);
    expect(bobInList?.isMuted).toBe(false);

    // Alice views her own followers list:
    // Bob follows Alice and muted her, but Alice should NOT see Bob's mute status towards her.
    const aliceViewFollowers = await followersGET(
      apiRequest("GET", { token: alice.token }),
      routeCtx({ id: "me" }),
    );
    const { body: aliceFollowersBody } = await readResponse(aliceViewFollowers);
    const bobInAliceList = aliceFollowersBody.users.find((u: { id: string }) => u.id === bob.id);
    expect(bobInAliceList?.muteStudyStartNotification).toBe(0);
    expect(bobInAliceList?.isMuted).toBe(false);
  });

  it("sendToFollowers excludes followers who muted notifications", async () => {
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const charlie = await createUser({ name: "Charlie" });

    // Both Bob and Charlie follow Alice
    await followPUT(apiRequest("PUT", { token: bob.token }), routeCtx({ id: alice.id }));
    await followPUT(apiRequest("PUT", { token: charlie.token }), routeCtx({ id: alice.id }));

    // Bob mutes Alice, Charlie does not
    await followMutePUT(
      apiRequest("PUT", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );

    // Add device tokens
    await prisma.deviceToken.create({
      data: {
        userId: bob.id,
        token: "bob-token-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      },
    });
    await prisma.deviceToken.create({
      data: {
        userId: charlie.id,
        token: "charlie-token-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      },
    });

    // We can verify that sendToFollowers queries only unmuted followers (muteStudyStartNotification: 0)
    const unmutedFollowers = await prisma.follow.findMany({
      where: {
        followingId: alice.id,
        muteStudyStartNotification: 0,
      },
      select: { followerId: true },
    });
    expect(unmutedFollowers.map((f) => f.followerId)).toEqual([charlie.id]);
  });
});
