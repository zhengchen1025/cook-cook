#!/usr/bin/env node
// scripts/reset-db.js
// Backs up prisma/dev.db, runs prisma generate + migrate reset, then seeds a demo user and recipe.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const prismaDb = path.join(__dirname, "..", "prisma", "dev.db");
const backupPath = prismaDb + ".bak." + Date.now();

(async function main() {
  try {
    console.log("==> Reset DB script starting");

    if (fs.existsSync(prismaDb)) {
      console.log("Backing up existing dev.db ->", backupPath);
      fs.copyFileSync(prismaDb, backupPath);
    } else {
      console.log("No existing dev.db found, skipping backup");
    }

    console.log("Running: npx prisma generate");
    execSync("npx prisma generate", { stdio: "inherit" });

    console.log("Running: npx prisma migrate reset --force");
    execSync("npx prisma migrate reset --force", { stdio: "inherit" });

    console.log("Seeding demo user and recipe (via Prisma client)");
    // require after prisma generate
    const { PrismaClient } = require("@prisma/client");
    const bcrypt = require("bcrypt");
    const prisma = new PrismaClient();

    const demoEmail = "demo@example.com";
    const demoPassword = "password";

    const passwordHash = await bcrypt.hash(demoPassword, 10);

    const existing = await prisma.user.findUnique({
      where: { email: demoEmail },
    });
    if (!existing) {
      const user = await prisma.user.create({
        data: {
          email: demoEmail,
          passwordHash,
          name: "Demo User",
        },
      });

      const recipe = await prisma.recipe.create({
        data: {
          title: "Demo Recipe",
          body: "This is a seeded demo recipe.",
          feedback: "",
          authorId: user.id,
          images: { create: [{ url: "/uploads/1756274370441_306879.webp" }] },
        },
        include: { images: true },
      });

      console.log("Seeded demo user:", demoEmail);
      console.log("Seeded demo recipe id:", recipe.id);
    } else {
      console.log("Demo user already exists, skipping seed user creation");
    }

    await prisma.$disconnect();

    console.log("Done. You can start the server with: npm run dev");
  } catch (err) {
    console.error("Error running reset-db:", err);
    process.exit(1);
  }
})();
