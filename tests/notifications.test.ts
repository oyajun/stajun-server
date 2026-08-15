import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  apiRequest,
  cleanupTestData,
  createUser,
  readResponse,
  routeCtx,
} from "./helpers";
import { PUT as followPUT, DELETE as followDELETE } from "@/app/api/v1/follow/[id]/route";
import {
  GET as notificationsGET,
  POST as notificationsReadAllPOST,
} from "@/app/api/v1/notifications/route";
import { PATCH as notificationReadPATCH } from "@/app/api/v1/notifications/[id]/read/route";
import { GET as unreadCountGET } from "@/app/api/v1/notifications/unread-count/route";

describe("Notifications API", () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates a notification when user is followed and deletes when unfollowed", async () => {
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob", iconEmoji: "🐶", iconBackgroundColor: "#E0F2FE" });

    // Bob follows Alice
    const followRes = await followPUT(
      apiRequest("PUT", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );
    expect(followRes.status).toBe(200);

    // Check Alice's notifications
    const getRes = await notificationsGET(
      apiRequest("GET", { token: alice.token }),
    );
    const { status, body } = await readResponse(getRes);
    expect(status).toBe(200);
    expect(body.unreadCount).toBe(1);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].type).toBe("FOLLOW");
    expect(body.notifications[0].isRead).toBe(false);
    expect(body.notifications[0].actor.id).toBe(bob.id);
    expect(body.notifications[0].actor.name).toBe("Bob");
    expect(body.notifications[0].actor.iconEmoji).toBe("🐶");

    // Unread count API check
    const countRes = await unreadCountGET(
      apiRequest("GET", { token: alice.token }),
    );
    const countData = await readResponse(countRes);
    expect(countData.status).toBe(200);
    expect(countData.body.unreadCount).toBe(1);

    // Bob unfollows Alice
    const unfollowRes = await followDELETE(
      apiRequest("DELETE", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );
    expect(unfollowRes.status).toBe(204);

    // Alice's notifications should now be empty
    const getResAfter = await notificationsGET(
      apiRequest("GET", { token: alice.token }),
    );
    const afterData = await readResponse(getResAfter);
    expect(afterData.body.notifications).toHaveLength(0);
    expect(afterData.body.unreadCount).toBe(0);
  });

  it("supports individual and bulk mark-as-read", async () => {
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const charlie = await createUser({ name: "Charlie" });

    // Bob and Charlie follow Alice
    await followPUT(
      apiRequest("PUT", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );
    await followPUT(
      apiRequest("PUT", { token: charlie.token }),
      routeCtx({ id: alice.id }),
    );

    // Alice checks notifications -> 2 unread
    const getRes1 = await notificationsGET(
      apiRequest("GET", { token: alice.token }),
    );
    const data1 = await readResponse(getRes1);
    expect(data1.body.unreadCount).toBe(2);
    expect(data1.body.notifications).toHaveLength(2);

    const firstNotifId = data1.body.notifications[0].id;

    // Mark single notification as read
    const readSingleRes = await notificationReadPATCH(
      apiRequest("PATCH", { token: alice.token }),
      routeCtx({ id: firstNotifId }),
    );
    expect(readSingleRes.status).toBe(200);

    // Unread count should now be 1
    const countRes = await unreadCountGET(
      apiRequest("GET", { token: alice.token }),
    );
    const countData = await readResponse(countRes);
    expect(countData.body.unreadCount).toBe(1);

    // Mark all as read
    const readAllRes = await notificationsReadAllPOST(
      apiRequest("POST", { token: alice.token }),
    );
    expect(readAllRes.status).toBe(200);

    // Unread count should now be 0
    const countResAfter = await unreadCountGET(
      apiRequest("GET", { token: alice.token }),
    );
    const countDataAfter = await readResponse(countResAfter);
    expect(countDataAfter.body.unreadCount).toBe(0);
  });

  it("filters out notifications from blocked users", async () => {
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });

    // Bob follows Alice
    await followPUT(
      apiRequest("PUT", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );

    // Alice blocks Bob
    await prisma.block.create({
      data: { blockerId: alice.id, blockedId: bob.id },
    });

    // Alice checks notifications -> Bob's notification is excluded
    const getRes = await notificationsGET(
      apiRequest("GET", { token: alice.token }),
    );
    const data = await readResponse(getRes);
    expect(data.body.notifications).toHaveLength(0);
    expect(data.body.unreadCount).toBe(0);
  });
});
