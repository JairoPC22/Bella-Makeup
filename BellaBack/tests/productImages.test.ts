import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "products");

function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}

function savedPathFor(url: string): string {
  return path.resolve(UPLOADS_DIR, path.basename(url));
}

describe("Product images", () => {
  let cookie: string;
  let viewerCookie: string;
  let productId: string;
  const createdFiles: string[] = [];

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const admin = await prisma.user.upsert({
      where: { username: "product_images_test_admin" },
      update: {},
      create: {
        firstName: "Images",
        lastName: "Admin",
        displayName: "Images Admin",
        username: "product_images_test_admin",
        email: "product_images_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed",
        roleId: adminRole.id,
        allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: admin.id, roleId: adminRole.id })}`;

    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const viewer = await prisma.user.upsert({
      where: { username: "product_images_test_viewer" },
      update: {},
      create: {
        firstName: "V",
        lastName: "T",
        displayName: "V T",
        username: "product_images_test_viewer",
        email: "product_images_test_viewer@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed",
        roleId: viewerRole.id,
        allBranches: true,
      },
    });
    viewerCookie = `access_token=${signAccessToken({ sub: viewer.id, roleId: viewerRole.id })}`;

    const product = await prisma.product.create({
      data: {
        sku: `PIMG-TEST-${Date.now()}`,
        name: "Producto de prueba imagenes",
        price: 100,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    for (const filePath of createdFiles) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
    await prisma.product.delete({ where: { id: productId } }).catch(() => {});
    await prisma.user.deleteMany({
      where: { username: { in: ["product_images_test_admin", "product_images_test_viewer"] } },
    }).catch(() => {});
  });

  it("uploads the first image as primary, and a second upload leaves the first primary untouched", async () => {
    const buffer1 = await makeJpeg(50, 50);
    const first = await request(app)
      .post(`/api/products/${productId}/images`)
      .set("Cookie", [cookie])
      .attach("image", buffer1, "first.jpg");

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ isPrimary: true });
    expect(first.body).toHaveProperty("id");
    expect(first.body).toHaveProperty("url");
    // The served URL must not leak the underlying filesystem path.
    expect(first.body.url).not.toContain(process.cwd());
    expect(first.body.url).not.toMatch(/^[A-Za-z]:[\\/]/);
    createdFiles.push(savedPathFor(first.body.url));
    expect(fs.existsSync(savedPathFor(first.body.url))).toBe(true);

    const buffer2 = await makeJpeg(50, 50);
    const second = await request(app)
      .post(`/api/products/${productId}/images`)
      .set("Cookie", [cookie])
      .attach("image", buffer2, "second.jpg");

    expect(second.status).toBe(201);
    expect(second.body.isPrimary).toBe(false);
    createdFiles.push(savedPathFor(second.body.url));

    const firstRow = await prisma.productImage.findUnique({ where: { id: first.body.id } });
    expect(firstRow?.isPrimary).toBe(true);
  });

  it("PATCH .../primary sets the target primary and unsets the previous one in a single transaction", async () => {
    const images = await prisma.productImage.findMany({ where: { productId } });
    const previousPrimary = images.find((i) => i.isPrimary)!;
    const target = images.find((i) => !i.isPrimary)!;

    const res = await request(app)
      .patch(`/api/products/${productId}/images/${target.id}/primary`)
      .set("Cookie", [cookie]);

    expect(res.status).toBe(200);
    expect(res.body.isPrimary).toBe(true);

    const primaries = await prisma.productImage.findMany({ where: { productId, isPrimary: true } });
    expect(primaries).toHaveLength(1);
    expect(primaries[0].id).toBe(target.id);

    const oldPrimary = await prisma.productImage.findUnique({ where: { id: previousPrimary.id } });
    expect(oldPrimary?.isPrimary).toBe(false);
  });

  it("never ends up with two primary images when two uploads race for the same brand-new product", async () => {
    // Dedicated product with zero images so both concurrent requests start
    // from the same "first upload" decision point (existingCount === 0).
    const raceProduct = await prisma.product.create({
      data: { sku: `PIMG-RACE-${Date.now()}`, name: "Producto de prueba concurrencia", price: 50 },
    });

    try {
      const [bufferA, bufferB] = await Promise.all([makeJpeg(50, 50), makeJpeg(50, 50)]);

      // Fired together (not awaited one at a time) so both requests are
      // genuinely in flight at once — supertest opens a real ephemeral
      // server per call, so these interleave through multer's disk I/O and
      // the Prisma/Postgres round trips exactly like two real concurrent
      // clients would.
      const [resA, resB] = await Promise.all([
        request(app)
          .post(`/api/products/${raceProduct.id}/images`)
          .set("Cookie", [cookie])
          .attach("image", bufferA, "race-a.jpg"),
        request(app)
          .post(`/api/products/${raceProduct.id}/images`)
          .set("Cookie", [cookie])
          .attach("image", bufferB, "race-b.jpg"),
      ]);

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);
      createdFiles.push(savedPathFor(resA.body.url), savedPathFor(resB.body.url));

      const rows = await prisma.productImage.findMany({ where: { productId: raceProduct.id } });
      expect(rows).toHaveLength(2);
      const primaries = rows.filter((r) => r.isPrimary);
      expect(primaries).toHaveLength(1);
    } finally {
      await prisma.product.delete({ where: { id: raceProduct.id } }).catch(() => {});
    }
  });

  it("resizes images wider than 1200px down to 1200px without upscaling smaller images", async () => {
    const wideBuffer = await makeJpeg(2000, 100);
    const wide = await request(app)
      .post(`/api/products/${productId}/images`)
      .set("Cookie", [cookie])
      .attach("image", wideBuffer, "wide.jpg");
    expect(wide.status).toBe(201);
    const widePath = savedPathFor(wide.body.url);
    createdFiles.push(widePath);
    const wideMeta = await sharp(widePath).metadata();
    expect(wideMeta.width).toBe(1200);

    const smallBuffer = await makeJpeg(10, 10);
    const small = await request(app)
      .post(`/api/products/${productId}/images`)
      .set("Cookie", [cookie])
      .attach("image", smallBuffer, "small.jpg");
    expect(small.status).toBe(201);
    const smallPath = savedPathFor(small.body.url);
    createdFiles.push(smallPath);
    const smallMeta = await sharp(smallPath).metadata();
    expect(smallMeta.width).toBe(10);
  });

  it("deletes an image, removing both the file and the row", async () => {
    const buffer = await makeJpeg(50, 50);
    const uploaded = await request(app)
      .post(`/api/products/${productId}/images`)
      .set("Cookie", [cookie])
      .attach("image", buffer, "todelete.jpg");
    expect(uploaded.status).toBe(201);
    const filePath = savedPathFor(uploaded.body.url);
    expect(fs.existsSync(filePath)).toBe(true);

    const del = await request(app)
      .delete(`/api/products/${productId}/images/${uploaded.body.id}`)
      .set("Cookie", [cookie]);
    expect(del.status).toBe(204);

    expect(fs.existsSync(filePath)).toBe(false);
    const row = await prisma.productImage.findUnique({ where: { id: uploaded.body.id } });
    expect(row).toBeNull();
  });

  it("rejects a non-image file with 400, without crashing", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/images`)
      .set("Cookie", [cookie])
      .attach("image", Buffer.from("not an image"), { filename: "notes.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
  });

  it("rejects upload without products.edit permission", async () => {
    const buffer = await makeJpeg(50, 50);
    const res = await request(app)
      .post(`/api/products/${productId}/images`)
      .set("Cookie", [viewerCookie])
      .attach("image", buffer, "test.jpg");
    expect(res.status).toBe(403);
  });
});
