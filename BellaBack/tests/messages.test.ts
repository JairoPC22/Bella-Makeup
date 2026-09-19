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

describe("User-to-user messaging (participant-based conversations)", () => {
  let userACookie: string;
  let userBCookie: string;
  let userCCookie: string;
  let userA: { id: string };
  let userB: { id: string };
  let userC: { id: string };
  let userD: { id: string };
  let disabledUser: { id: string };
  const createdFiles: string[] = [];
  const testUsernames = [
    "messages_test_user_a",
    "messages_test_user_b",
    "messages_test_user_c",
    "messages_test_user_d",
    "messages_test_disabled",
    "messages_test_viewer",
  ];

  beforeAll(async () => {
    // Use the admin role for the primary actors: it's guaranteed to hold
    // messages.view/messages.send and, unlike cashier, isn't at risk of
    // having those permissions clobbered by tests/roles.test.ts's "restore
    // the seeded cashier permission set" step (that restore uses a
    // hardcoded pre-messaging-feature permission list for cashier
    // specifically, which runs earlier in the same singleFork suite).
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
    userBCookie = `access_token=${signAccessToken({ sub: b.id, roleId: adminRole.id })}`;

    // A third user, unrelated to any A<->B conversation — used to verify
    // that a non-participant gets 403 on GET/POST/DELETE, and as a third
    // member of group-conversation tests.
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

    const d = await prisma.user.upsert({
      where: { username: "messages_test_user_d" },
      update: {},
      create: {
        firstName: "User", lastName: "D", displayName: "User D",
        username: "messages_test_user_d", email: "messages_test_user_d@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    userD = { id: d.id };

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
    const testUserIds = [userA.id, userB.id, userC.id, userD.id, disabledUser.id];
    await prisma.message.deleteMany({
      where: { conversation: { participants: { some: { userId: { in: testUserIds } } } } },
    }).catch(() => {});
    await prisma.conversationParticipant.deleteMany({
      where: { userId: { in: testUserIds } },
    }).catch(() => {});
    await prisma.conversation.deleteMany({
      where: { participants: { none: {} } },
    }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } }).catch(() => {});
  });

  it("normalizes an unordered user pair: starting from A->B and B->A returns the same conversation", async () => {
    const first = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
    expect(first.status).toBe(201);
    expect(first.body.isGroup).toBe(false);

    const second = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userBCookie])
      .send({ participantIds: [userA.id] });
    expect(second.status).toBe(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it("never leaks raw Prisma user rows (incl. passwordHash) in the startConversation response", async () => {
    const res = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
    expect(res.status).toBe(201);
    expect(res.body.participants).toBeInstanceOf(Array);
    expect(res.body.participants.length).toBe(2);
    for (const p of res.body.participants) {
      expect(p.user.passwordHash).toBeUndefined();
    }
    expect(res.body.participants.some((p: any) => p.user.id === userB.id)).toBe(true);
  });

  it("rejects starting a conversation with a disabled user with 400", async () => {
    const res = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [disabledUser.id] });
    expect(res.status).toBe(400);
  });

  it("rejects starting a conversation with only your own id (no other participant) with 400", async () => {
    const res = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userA.id] });
    expect(res.status).toBe(400);
  });

  it("starting a group with 2 explicit participantIds creates isGroup:true with 3 participants (caller + 2)", async () => {
    const res = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userC.id, userD.id], name: "Equipo de prueba" });
    expect(res.status).toBe(201);
    expect(res.body.isGroup).toBe(true);
    expect(res.body.name).toBe("Equipo de prueba");
    expect(res.body.participants).toHaveLength(3);
    const ids = res.body.participants.map((p: any) => p.user.id);
    expect(ids).toEqual(expect.arrayContaining([userA.id, userC.id, userD.id]));
  });

  it("starting a group twice with the same people does NOT dedup (always creates a new conversation)", async () => {
    const first = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userC.id, userD.id] });
    const second = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userC.id, userD.id] });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
  });

  it("rejects GET, POST and DELETE for a user who isn't a participant", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
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

    const deleteRes = await request(app)
      .delete(`/api/messages/conversations/${conversationId}`)
      .set("Cookie", [userCCookie]);
    expect(deleteRes.status).toBe(403);
  });

  it("sends a text-only message and retrieves it via GET (response now includes a `conversation` + `messages` envelope)", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
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
    expect(list.body.conversation.id).toBe(conversationId);
    expect(list.body.conversation.participants).toBeInstanceOf(Array);
    expect(list.body.messages.some((m: any) => m.id === send.body.id)).toBe(true);
  });

  it("rejects an empty body with zero attachments with 400", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
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
      .send({ participantIds: [userB.id] });
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
      .send({ participantIds: [userB.id] });
    expect(res.status).toBe(403);

    await prisma.user.deleteMany({ where: { username: "messages_test_viewer" } });
  });

  it("viewing a conversation marks it read: unreadCount drops to 0 for the viewer while the other participant still sees it unread", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
    const conversationId = conv.body.id;

    const sendRes = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie])
      .field("body", "¿Viste esto?");
    expect(sendRes.status).toBe(201);

    // B hasn't viewed yet — should show up unread in B's list.
    const listBefore = await request(app)
      .get("/api/messages/conversations")
      .set("Cookie", [userBCookie]);
    const convBefore = listBefore.body.find((c: any) => c.id === conversationId);
    expect(convBefore.unreadCount).toBeGreaterThan(0);

    // B opens the conversation — this should mark it read as a side effect.
    const viewRes = await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userBCookie]);
    expect(viewRes.status).toBe(200);

    const listAfter = await request(app)
      .get("/api/messages/conversations")
      .set("Cookie", [userBCookie]);
    const convAfter = listAfter.body.find((c: any) => c.id === conversationId);
    expect(convAfter.unreadCount).toBe(0);

    // A never sent anything unread to themselves — A's own view should
    // never show unread on a conversation only containing A's own messages.
    const listA = await request(app)
      .get("/api/messages/conversations")
      .set("Cookie", [userACookie]);
    const convA = listA.body.find((c: any) => c.id === conversationId);
    expect(convA.unreadCount).toBe(0);
  });

  it("Task 3 seen contract: the OTHER participant's lastReadAt is exposed on the message-list response, and reflects reading my message", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
    const conversationId = conv.body.id;

    const sendRes = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie])
      .field("body", "Mensaje de A");
    const messageCreatedAt = sendRes.body.createdAt;

    // Before B reads: B's participant entry should have lastReadAt that
    // does NOT cover this message yet (either null or before createdAt).
    const beforeRead = await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie]);
    const bEntryBefore = beforeRead.body.conversation.participants.find((p: any) => p.user.id === userB.id);
    if (bEntryBefore.lastReadAt) {
      expect(new Date(bEntryBefore.lastReadAt).getTime()).toBeLessThan(new Date(messageCreatedAt).getTime());
    }

    // B reads the conversation.
    await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userBCookie]);

    // A re-fetches: B's lastReadAt should now be >= the message's createdAt.
    const afterRead = await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie]);
    const bEntryAfter = afterRead.body.conversation.participants.find((p: any) => p.user.id === userB.id);
    expect(bEntryAfter.lastReadAt).not.toBeNull();
    expect(new Date(bEntryAfter.lastReadAt).getTime()).toBeGreaterThanOrEqual(new Date(messageCreatedAt).getTime());
  });

  it("hiding a conversation removes it from the caller's own list, but not from the other participant's, and doesn't delete data", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
    const conversationId = conv.body.id;
    await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie])
      .field("body", "Mensaje antes de ocultar");

    const hideRes = await request(app)
      .delete(`/api/messages/conversations/${conversationId}`)
      .set("Cookie", [userACookie]);
    expect(hideRes.status).toBe(204);

    const listA = await request(app).get("/api/messages/conversations").set("Cookie", [userACookie]);
    expect(listA.body.some((c: any) => c.id === conversationId)).toBe(false);

    const listB = await request(app).get("/api/messages/conversations").set("Cookie", [userBCookie]);
    expect(listB.body.some((c: any) => c.id === conversationId)).toBe(true);

    // A can still open it directly (hidden != 403) and the message is
    // still there — hide is a per-viewer list flag, not a hard delete.
    const viewRes = await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie]);
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.messages.length).toBeGreaterThan(0);
  });

  it("sending a new message into a conversation one participant had hidden un-hides it for them", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
    const conversationId = conv.body.id;

    const hideRes = await request(app)
      .delete(`/api/messages/conversations/${conversationId}`)
      .set("Cookie", [userACookie]);
    expect(hideRes.status).toBe(204);

    let listA = await request(app).get("/api/messages/conversations").set("Cookie", [userACookie]);
    expect(listA.body.some((c: any) => c.id === conversationId)).toBe(false);

    // B sends a new message into the (for A) hidden conversation.
    const sendRes = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userBCookie])
      .field("body", "Un mensaje nuevo");
    expect(sendRes.status).toBe(201);

    listA = await request(app).get("/api/messages/conversations").set("Cookie", [userACookie]);
    expect(listA.body.some((c: any) => c.id === conversationId)).toBe(true);
  });

  it("re-starting a 1:1 conversation you had hidden un-hides it (dedup still finds the same row)", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
    const conversationId = conv.body.id;

    await request(app).delete(`/api/messages/conversations/${conversationId}`).set("Cookie", [userACookie]);
    let listA = await request(app).get("/api/messages/conversations").set("Cookie", [userACookie]);
    expect(listA.body.some((c: any) => c.id === conversationId)).toBe(false);

    const restart = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
    expect(restart.status).toBe(201);
    expect(restart.body.id).toBe(conversationId);

    listA = await request(app).get("/api/messages/conversations").set("Cookie", [userACookie]);
    expect(listA.body.some((c: any) => c.id === conversationId)).toBe(true);
  });

  it("GET /api/messages/unread-count reflects reality: 0 with no unread, increases after a message arrives, drops after viewing", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
    const conversationId = conv.body.id;

    // Make sure it starts clean for B (view it once).
    await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userBCookie]);

    const before = await request(app).get("/api/messages/unread-count").set("Cookie", [userBCookie]);
    expect(before.status).toBe(200);
    const beforeCount = before.body.count;

    await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userACookie])
      .field("body", "Un mensaje sin leer");

    const after = await request(app).get("/api/messages/unread-count").set("Cookie", [userBCookie]);
    expect(after.body.count).toBe(beforeCount + 1);

    await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [userBCookie]);

    const afterRead = await request(app).get("/api/messages/unread-count").set("Cookie", [userBCookie]);
    expect(afterRead.body.count).toBe(beforeCount);
  });

  it("deleteExpiredMessages() removes messages older than 30 days (and their attachment files) while keeping recent ones — unmodified by the schema pivot", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [userACookie])
      .send({ participantIds: [userB.id] });
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
