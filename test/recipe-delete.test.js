const request = require("supertest");
const { PrismaClient } = require("@prisma/client");

const app = require("../src/index");
const prisma = new PrismaClient();

function extractCookie(res) {
  const sc = res.headers["set-cookie"] || [];
  return sc.map((s) => s.split(";")[0]).join("; ");
}

describe("Recipe DELETE endpoint", () => {
  beforeEach(async () => {
    // clean dependent tables first
    await prisma.session.deleteMany();
    await prisma.attempt.deleteMany();
    await prisma.image.deleteMany();
    await prisma.recipe.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows the owner to delete a recipe and removes dependent attempts/images", async () => {
    const email = "owner@example.com";
    const password = "password123";

    // register (also logs in)
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email, password, name: "Owner" })
      .expect(201);

    const cookie = extractCookie(reg);

    // create a recipe as owner
    const recipeRes = await request(app)
      .post("/api/recipes")
      .set("Cookie", cookie)
      .send({ title: "Owner Recipe", body: "body", images: ["u1", "u2"] })
      .expect(201);

    const recipeId = recipeRes.body.id;

    // create an attempt with images for that recipe
    const attemptRes = await request(app)
      .post(`/api/recipes/${recipeId}/attempts`)
      .set("Cookie", cookie)
      .send({ body: "attempt body", images: ["a1"] })
      .expect(201);

    const attemptId = attemptRes.body.id;

    // Delete the recipe as owner
    await request(app)
      .delete(`/api/recipes/${recipeId}`)
      .set("Cookie", cookie)
      .expect(204);

    // Verify recipe removed
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect(recipe).toBeNull();

    // Verify attempt removed
    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
    });
    expect(attempt).toBeNull();

    // Verify images removed (both recipe and attempt images)
    const images = await prisma.image.findMany({
      where: { OR: [{ recipeId }, { attemptId }] },
    });
    expect(images).toHaveLength(0);
  });

  it("prevents non-owners from deleting a recipe (403)", async () => {
    // owner creates recipe
    const r1 = await request(app)
      .post("/api/auth/register")
      .send({ email: "a1@example.com", password: "pwd" })
      .expect(201);
    const cookie1 = extractCookie(r1);

    const recipeRes = await request(app)
      .post("/api/recipes")
      .set("Cookie", cookie1)
      .send({ title: "Shared Recipe", body: "b" })
      .expect(201);
    const recipeId = recipeRes.body.id;

    // another user registers (different session)
    const r2 = await request(app)
      .post("/api/auth/register")
      .send({ email: "b1@example.com", password: "pwd" })
      .expect(201);
    const cookie2 = extractCookie(r2);

    // attempt delete as non-owner
    const res = await request(app)
      .delete(`/api/recipes/${recipeId}`)
      .set("Cookie", cookie2)
      .expect(403);

    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].field).toBe("auth");
  });
});
