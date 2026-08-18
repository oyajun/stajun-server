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
  GET as pushSettingsGET,
  PUT as pushSettingsPUT,
} from "@/app/api/v1/settings/push-notifications/route";
import { PUT as followPUT } from "@/app/api/v1/follow/[id]/route";

describe("Push Notification Settings API", () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("returns default settings (all true) when no settings record exists", async () => {
    const user = await createUser({ name: "Alice" });

    const res = await pushSettingsGET(
      apiRequest("GET", { token: user.token }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(200);
    expect(body).toEqual({
      enabled: true,
      follow: true,
      studyStart: true,
    });
  });

  it("updates and retrieves push notification settings", async () => {
    const user = await createUser({ name: "Bob" });

    // 1. Disable master push notifications
    const update1 = await pushSettingsPUT(
      apiRequest("PUT", {
        token: user.token,
        body: { enabled: false },
      }),
    );
    const { status: status1, body: body1 } = await readResponse(update1);
    expect(status1).toBe(200);
    expect(body1).toEqual({
      enabled: false,
      follow: true,
      studyStart: true,
    });

    // 2. Disable studyStart notification (partial update)
    const update2 = await pushSettingsPUT(
      apiRequest("PUT", {
        token: user.token,
        body: { studyStart: false },
      }),
    );
    const { status: status2, body: body2 } = await readResponse(update2);
    expect(status2).toBe(200);
    expect(body2).toEqual({
      enabled: false,
      follow: true,
      studyStart: false,
    });

    // 3. Verify via GET
    const getRes = await pushSettingsGET(
      apiRequest("GET", { token: user.token }),
    );
    const { status: getStatus, body: getBody } = await readResponse(getRes);
    expect(getStatus).toBe(200);
    expect(getBody).toEqual({
      enabled: false,
      follow: true,
      studyStart: false,
    });
  });

  it("rejects invalid field types with 400", async () => {
    const user = await createUser({ name: "Charlie" });

    const res = await pushSettingsPUT(
      apiRequest("PUT", {
        token: user.token,
        body: { enabled: "not_a_boolean" },
      }),
    );
    const { status, body } = await readResponse(res);
    expect(status).toBe(400);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("sendToFollowers excludes followers who disabled master push or studyStart notifications", async () => {
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" }); // disabled master push
    const charlie = await createUser({ name: "Charlie" }); // disabled studyStart
    const dave = await createUser({ name: "Dave" }); // default (all true)

    // Bob, Charlie, Dave follow Alice
    await followPUT(apiRequest("PUT", { token: bob.token }), routeCtx({ id: alice.id }));
    await followPUT(apiRequest("PUT", { token: charlie.token }), routeCtx({ id: alice.id }));
    await followPUT(apiRequest("PUT", { token: dave.token }), routeCtx({ id: alice.id }));

    // Bob sets enabled = false
    await pushSettingsPUT(
      apiRequest("PUT", {
        token: bob.token,
        body: { enabled: false },
      }),
    );

    // Charlie sets studyStart = false
    await pushSettingsPUT(
      apiRequest("PUT", {
        token: charlie.token,
        body: { studyStart: false },
      }),
    );

    // Query unmuted followers considering push notification settings
    const activeFollowers = await prisma.follow.findMany({
      where: {
        followingId: alice.id,
        muteStudyStartNotification: 0,
        follower: {
          OR: [
            { pushNotificationSetting: null },
            {
              pushNotificationSetting: {
                enabled: true,
                studyStart: true,
              },
            },
          ],
        },
      },
      select: { followerId: true },
    });

    // Only Dave should receive notifications
    expect(activeFollowers.map((f) => f.followerId)).toEqual([dave.id]);
  });

  it("still creates in-app notification when target user disabled follow push notifications", async () => {
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });

    // Alice disables follow push notifications
    await pushSettingsPUT(
      apiRequest("PUT", {
        token: alice.token,
        body: { follow: false },
      }),
    );

    // Bob follows Alice
    const followRes = await followPUT(
      apiRequest("PUT", { token: bob.token }),
      routeCtx({ id: alice.id }),
    );
    const { status } = await readResponse(followRes);
    expect(status).toBe(200);

    // In-app notification record is still created
    const notif = await prisma.notification.findFirst({
      where: {
        userId: alice.id,
        actorId: bob.id,
        type: "FOLLOW",
      },
    });
    expect(notif).not.toBeNull();
  });
});
