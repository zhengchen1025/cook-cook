#!/usr/bin/env node
// scripts/remove-seed-recipes.js
// Safe, one-off script to remove seeded/test recipes that were included in dev.db

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async function main() {
  try {
    console.log(
      'Searching for seeded/test recipes (title startsWith "Test Recipe" or body includes "Test recipe body")'
    );

    const toRemove = await prisma.recipe.findMany({
      where: {
        OR: [
          { title: { startsWith: "Test Recipe" } },
          { body: { contains: "Test recipe body" } },
        ],
      },
    });

    if (!toRemove.length) {
      console.log("No matching recipes found. Nothing to delete.");
      return;
    }

    console.log(`Found ${toRemove.length} recipes:`);
    toRemove.forEach((r) => {
      console.log(` - id=${r.id} title=${r.title} authorId=${r.authorId}`);
    });

    // Delete dependent attempts and images for each recipe safely
    for (const r of toRemove) {
      console.log(`Deleting recipe ${r.id} and dependent attempts/images...`);
      await prisma.$transaction(async (tx) => {
        const attempts = await tx.attempt.findMany({
          where: { recipeId: r.id },
          select: { id: true },
        });
        const attemptIds = attempts.map((a) => a.id);
        if (attemptIds.length) {
          await tx.image.deleteMany({
            where: { attemptId: { in: attemptIds } },
          });
          await tx.attempt.deleteMany({ where: { id: { in: attemptIds } } });
        }
        await tx.image.deleteMany({ where: { recipeId: r.id } });
        await tx.recipe.delete({ where: { id: r.id } });
      });
      console.log(`Deleted recipe ${r.id}`);
    }

    console.log("Done.");
  } catch (err) {
    console.error("Error deleting seed/test recipes:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
