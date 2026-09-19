import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { deleteExpiredMessages } from "../src/services/messageService";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "messages");

function savedPathFor(url: string): string {
  return path.resolve(UPLOADS_DIR, path.basename(url));
}

describe("User-to-user messaging", () => {
  let userACookie: string;
  let userA: { id: string };
  let userB: { id: string };
  let userC: { id: string };
  let disabledUser: { id: string };
  let userCCookie: string;
  const createdFiles: string[] = [];
  const testUsernames = [
    "messages_test_user_a",
    "messages_test_user_b",
    "messages_test_user_c",
    "messages_test_disabled",
    "messages_test_viewer",
  ];

  beforeAll(async () => {
    // Use the admin role for the primary actors (userA/userB/userC): it's
    // guaranteed to hold messages.view/messages.send and, unlike cashier,
    // isn't at risk of having those permissions clobbered by
    // tests/roles.test.ts's "restore the seeded cashier permission set"
    // step (that restore uses a hardcoded pre-messaging-feature permission
    // list for cashier specifically, which runs earlier in the same
    // singleFork suite). Mirrors the pre-pivot branch-messaging test's own
    // choice of admin for its acting users, for the same reason.
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });

    const a = await prisma.user.upsert({
      where: { username: "messages_test_user_a" },
      update: {},
      create: {
        firstName: "User", lastName: "A", displayName: "User A",
        username: "messages_test_user_a", email: "messages_test_user_a@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    userA = { id: a.id };
    userACookie = `access_token=${signAccessToken({ sub: a.id, roleId: adminRole.id })}`;

    const b = await prisma.user.upsert({
      where: { username: "messages_test_user_b" },
      update: {},
      create: {
        firstName: "User", lastName: "B", displayName: "User B",
        username: "messages_test_user_b", email: "messages_test_user_b@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    userB = { id: b.id };

    // A third user, unrelated to any A<->B conversation — used to verify
    // that a non-participant gets 403 on both GET and POST.
    const c = await prisma.user.upsert({
      where: { username: "messages_test_user_c" },
      update: {},
      create: {
        firstName: "User", lastName: "C", displayName: "User C",
        username: "messages_test_user_c", email: "messages_test_user_c@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    userC = { id: c.id };
    userCCookie = `access_token=${signAccessToken({ sub: c.id, roleId: adminRole.id })}`;

    const disabled = await prisma.user.upsert({
      where: { username: "messages_test_disabled" },
      update: { status: "DISABLED" },
      create: {
        firstName: "User", lastName: "Disabled", displayName: "User Disabled",
        username: "messages_test_disabled", email: "messages_test_disabled@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id,
        allBranches: true, status: "DISABLED",
      },
    });
    disabledUser = { id: disabled.id };
  });

  afterAll(async () => {
    for (const filePath of createdFiles) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
    const testUserIds = [userA.id, userB.id, userC.id, disabledUser.id];
    await prisma.message.deleteMany({
      where: { conversation: { OR: [{ userAId: { in: testUserIds } }, { userBId: { in: testUserIds } }] } },
    }).catch(() => {});
    await prisma.conversation.deleteMany({
      where: { OR: [{ userAId: { in: testUserIds } }, { userBId: { in: testUserIds } }] },
    }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } }).catch(() => {});
  });

  it("normalizes an unordered user pair: starting from A->B and B->A returns the same conversation", async () => {
    const first = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ otherUserId: userB.id });
    expect(first.status).toBe(201);

    // Now start from B's side (B -> A) using B's own cookie.
    const bRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const userBCookie = `access_token=${signAccessToken({ sub: userB.id, roleId: bRole.id })}`;
    const second = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userBCookie])
      .send({ otherUserId: userA.id });
    expect(second.status).toBe(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it("never leaks the raw userA/userB rows (incl. passwordHash) in the startConversation response", async () => {
    const res = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ otherUserId: userB.id });
    expect(res.status).toBe(201);
    expect(res.body.userA).toBeUndefined();
    expect(res.body.userB).toBeUndefined();
    expect(res.body.otherUser).toBeDefined();
    expect(res.body.otherUser.id).toBe(userB.id);
    expect(res.body.otherUser.passwordHash).toBeUndefined();
  });

  it("rejects starting a conversation with yourself with 400", async () => {
    const res = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ otherUserId: userA.id });
    expect(res.status).toBe(400);
  });

  it("rejects starting a conversation with a disabled user with 400", async () => {
    const res = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ otherUserId: disabledUser.id });
    expect(res.status).toBe(400);
  });

  it("rejects GET and POST messages for a user who isn't a participant", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ otherUserId: userB.id });
    const conversationId = conv.body.id;

    const getRes = await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userCCookie]);
    expect(getRes.status).toBe(403);

    const postRes = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userCCookie])
      .field("body", "Hola");
    expect(postRes.status).toBe(403);
  });

  it("sends a text-only message and retrieves it via GET", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ otherUserId: userB.id });
    const conversationId = conv.body.id;

    const send = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie])
      .field("body", "Hola desde A");
    expect(send.status).toBe(201);
    expect(send.body.body).toBe("Hola desde A");
    expect(send.body.author.id).toBe(userA.id);

    const list = await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie]);
    expect(list.status).toBe(200);
    expect(list.body.some((m: any) => m.id === send.body.id)).toBe(true);
  });

  it("rejects an empty body with zero attachments with 400", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ otherUserId: userB.id });
    const conversationId = conv.body.id;

    const send = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie])
      .field("body", "   ");
    expect(send.status).toBe(400);
  });

  it("uploads an attachment and returns it in the message's attachments array", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ otherUserId: userB.id });
    const conversationId = conv.body.id;

    const send = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie])
      .field("body", "Con adjunto")
      .attach("attachments", Buffer.from("fake-png-bytes"), { filename: "test.png", contentType: "image/png" });

    expect(send.status).toBe(201);
    expect(send.body.attachments).toHaveLength(1);
    expect(send.body.attachments[0].fileName).toBe("test.png");
    expect(send.body.attachments[0].mimeType).toBe("image/png");
    expect(typeof send.body.attachments[0].url).toBe("string");
    createdFiles.push(savedPathFor(send.body.attachments[0].url));
    expect(fs.existsSync(savedPathFor(send.body.attachments[0].url))).toBe(true);
  });

  it("rejects starting a conversation without messages.send permission", async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const viewer = await prisma.user.upsert({
      where: { username: "messages_test_viewer" },
      update: {},
      create: {
        firstName: "V", lastName: "T", displayName: "V T", username: "messages_test_viewer",
        email: "messages_test_viewer@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: viewerRole.id, allBranches: true,
      },
    });
    const viewerCookie = `access_token=${signAccessToken({ sub: viewer.id, roleId: viewerRole.id })}`;

    const res = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [viewerCookie])
      .send({ otherUserId: userB.id });
    expect(res.status).toBe(403);

    await prisma.user.deleteMany({ where: { username: "messages_test_viewer" } });
  });

  it("deleteExpiredMessages() removes messages older than 30 days (and their attachment files) while keeping recent ones", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ otherUserId: userB.id });
    const conversationId = conv.body.id;

    const oldMsg = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie])
      .field("body", "Mensaje viejo")
      .attach("attachments", Buffer.from("old-file-bytes"), { filename: "old.png", contentType: "image/png" });
    expect(oldMsg.status).toBe(201);
    const oldFilePath = savedPathFor(oldMsg.body.attachments[0].url);
    expect(fs.existsSync(oldFilePath)).toBe(true);

    const recentMsg = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie])
      .field("body", "Mensaje reciente");
    expect(recentMsg.status).toBe(201);

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await prisma.message.update({ where: { id: oldMsg.body.id }, data: { createdAt: thirtyOneDaysAgo } });

    await deleteExpiredMessages();

    const oldRow = await prisma.message.findUnique({ where: { id: oldMsg.body.id } });
    expect(oldRow).toBeNull();
    expect(fs.existsSync(oldFilePath)).toBe(false);

    const recentRow = await prisma.message.findUnique({ where: { id: recentMsg.body.id } });
    expect(recentRow).not.toBeNull();
  });
});
