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

describe("Branch messaging", () => {
  let adminCookie: string;
  let branchA: { id: string; name: string };
  let branchB: { id: string; name: string };
  let branchC: { id: string; name: string };
  let outsiderCookie: string;
  const createdFiles: string[] = [];

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const admin = await prisma.user.upsert({
      where: { username: "messages_test_admin" },
      update: {},
      create: {
        firstName: "Messages", lastName: "Admin", displayName: "Messages Admin",
        username: "messages_test_admin", email: "messages_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    adminCookie = `access_token=${signAccessToken({ sub: admin.id, roleId: adminRole.id })}`;

    branchA = await prisma.branch.create({ data: { name: `Msg Branch A ${Date.now()}` } });
    branchB = await prisma.branch.create({ data: { name: `Msg Branch B ${Date.now()}` } });
    branchC = await prisma.branch.create({ data: { name: `Msg Branch C ${Date.now()}` } });

    // Branch-scoped user with access to neither branchA nor branchB — only
    // assigned to the unrelated branchC. allBranches is false so hasBranchAccess
    // falls through to the UserBranch lookup, which finds nothing for A/B.
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const outsider = await prisma.user.upsert({
      where: { username: "messages_test_outsider" },
      update: {},
      create: {
        firstName: "Out", lastName: "Sider", displayName: "Out Sider",
        username: "messages_test_outsider", email: "messages_test_outsider@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: cashierRole.id, allBranches: false,
      },
    });
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: outsider.id, branchId: branchC.id } },
      update: {},
      create: { userId: outsider.id, branchId: branchC.id },
    });
    outsiderCookie = `access_token=${signAccessToken({ sub: outsider.id, roleId: cashierRole.id })}`;
  });

  afterAll(async () => {
    for (const filePath of createdFiles) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
    await prisma.branchMessage.deleteMany({
      where: { conversation: { OR: [{ branchAId: branchA.id }, { branchBId: branchA.id }, { branchAId: branchB.id }, { branchBId: branchB.id }, { branchAId: branchC.id }, { branchBId: branchC.id }] } },
    }).catch(() => {});
    await prisma.branchConversation.deleteMany({
      where: { OR: [{ branchAId: branchA.id }, { branchBId: branchA.id }, { branchAId: branchB.id }, { branchBId: branchB.id }, { branchAId: branchC.id }, { branchBId: branchC.id }] },
    }).catch(() => {});
    await prisma.userBranch.deleteMany({ where: { branchId: { in: [branchA.id, branchB.id, branchC.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: ["messages_test_admin", "messages_test_outsider"] } } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id, branchC.id] } } }).catch(() => {});
  });

  it("normalizes an unordered branch pair: starting from A->B and B->A returns the same conversation", async () => {
    const first = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [adminCookie])
      .send({ fromBranchId: branchA.id, toBranchId: branchB.id });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [adminCookie])
      .send({ fromBranchId: branchB.id, toBranchId: branchA.id });
    expect(second.status).toBe(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it("rejects GET and POST messages for a user with access to neither branch", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [adminCookie])
      .send({ fromBranchId: branchA.id, toBranchId: branchB.id });
    const conversationId = conv.body.id;

    const getRes = await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [outsiderCookie]);
    expect(getRes.status).toBe(403);

    const postRes = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [outsiderCookie])
      .field("fromBranchId", branchA.id)
      .field("body", "Hola");
    expect(postRes.status).toBe(403);
  });

  it("sends a text-only message and retrieves it via GET", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [adminCookie])
      .send({ fromBranchId: branchA.id, toBranchId: branchB.id });
    const conversationId = conv.body.id;

    const send = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [adminCookie])
      .field("fromBranchId", branchA.id)
      .field("body", "Hola desde A");
    expect(send.status).toBe(201);
    expect(send.body.body).toBe("Hola desde A");

    const list = await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [adminCookie]);
    expect(list.status).toBe(200);
    expect(list.body.some((m: any) => m.id === send.body.id)).toBe(true);
  });

  it("rejects a fromBranchId that isn't one of the conversation's two branches with 400", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [adminCookie])
      .send({ fromBranchId: branchA.id, toBranchId: branchB.id });
    const conversationId = conv.body.id;

    const send = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [adminCookie])
      .field("fromBranchId", branchC.id)
      .field("body", "No debería funcionar");
    expect(send.status).toBe(400);
  });

  it("rejects an empty body with zero attachments with 400", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [adminCookie])
      .send({ fromBranchId: branchA.id, toBranchId: branchB.id });
    const conversationId = conv.body.id;

    const send = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [adminCookie])
      .field("fromBranchId", branchA.id)
      .field("body", "   ");
    expect(send.status).toBe(400);
  });

  it("uploads an attachment and returns it in the message's attachments array", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [adminCookie])
      .send({ fromBranchId: branchA.id, toBranchId: branchB.id });
    const conversationId = conv.body.id;

    const send = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [adminCookie])
      .field("fromBranchId", branchA.id)
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
      .send({ fromBranchId: branchA.id, toBranchId: branchB.id });
    expect(res.status).toBe(403);

    await prisma.user.deleteMany({ where: { username: "messages_test_viewer" } });
  });

  it("deleteExpiredMessages() removes messages older than 30 days (and their attachment files) while keeping recent ones", async () => {
    const conv = await request(app)
      .post("/api/messages/conversations")
      .set("Cookie", [adminCookie])
      .send({ fromBranchId: branchA.id, toBranchId: branchB.id });
    const conversationId = conv.body.id;

    const oldMsg = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [adminCookie])
      .field("fromBranchId", branchA.id)
      .field("body", "Mensaje viejo")
      .attach("attachments", Buffer.from("old-file-bytes"), { filename: "old.png", contentType: "image/png" });
    expect(oldMsg.status).toBe(201);
    const oldFilePath = savedPathFor(oldMsg.body.attachments[0].url);
    expect(fs.existsSync(oldFilePath)).toBe(true);

    const recentMsg = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set("Cookie", [adminCookie])
      .field("fromBranchId", branchA.id)
      .field("body", "Mensaje reciente");
    expect(recentMsg.status).toBe(201);

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await prisma.branchMessage.update({ where: { id: oldMsg.body.id }, data: { createdAt: thirtyOneDaysAgo } });

    await deleteExpiredMessages();

    const oldRow = await prisma.branchMessage.findUnique({ where: { id: oldMsg.body.id } });
    expect(oldRow).toBeNull();
    expect(fs.existsSync(oldFilePath)).toBe(false);

    const recentRow = await prisma.branchMessage.findUnique({ where: { id: recentMsg.body.id } });
    expect(recentRow).not.toBeNull();
  });
});
