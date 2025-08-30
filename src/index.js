// src/index.js
const express = require("express");
const app = express();
const PORT = process.env.PORT || 4000;
const cors = require("cors");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const session = require("express-session");
const { PrismaSessionStore } = require("@quixo3/prisma-session-store");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");

const prisma = new PrismaClient();

app.use(express.json());
app.use(cors());

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    errors: [
      {
        field: "rateLimit",
        message: "Too many auth requests, please try again later",
      },
    ],
  },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit writes to 30 per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    errors: [{ field: "rateLimit", message: "Too many requests, slow down" }],
  },
});

// sessions
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-session-secret";
app.use(
  session({
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 2 * 60 * 1000,
      dbRecordIdIsSessionId: true,
    }),
  })
);

// helpers
const {
  buildError,
  sendError, // 兼容旧调用
  sendErrors, // 发送结构化 errors: [...]
  isNonEmptyString,
  isStringOrEmpty,
  isPlainObject,
  ensureArray,
} = require("./utils/validate");

// --- Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// serve uploads
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "public", "uploads"))
);

// mount uploads route
const uploadsRouter = require("./uploads");
app.use("/api/uploads", uploadsRouter);

// auth helpers
function toPublicUser(user) {
  if (!user) return null;
  const { id, email, name, createdAt, updatedAt } = user;
  return { id, email, name, createdAt, updatedAt };
}

async function findUserByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return sendErrors(res, 401, buildError("auth", "authentication required"));
  }
  next();
}

// --- Auth routes ---
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    const errors = [];
    if (!isNonEmptyString(email))
      errors.push(buildError("email", "email is required"));
    if (!isNonEmptyString(password))
      errors.push(buildError("password", "password is required"));
    if (errors.length) return sendErrors(res, 400, errors);

    const exists = await findUserByEmail(email);
    if (exists)
      return sendErrors(
        res,
        409,
        buildError("email", "email already registered")
      );

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash,
        name: isStringOrEmpty(name) ? name : null,
      },
    });

    req.session.userId = user.id;
    return res.status(201).json({ user: toPublicUser(user) });
  } catch (error) {
    console.error("Register error:", error);
    return sendErrors(res, 500, buildError("database", "Failed to register"));
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const errors = [];
    if (!isNonEmptyString(email))
      errors.push(buildError("email", "email is required"));
    if (!isNonEmptyString(password))
      errors.push(buildError("password", "password is required"));
    if (errors.length) return sendErrors(res, 400, errors);

    const user = await findUserByEmail(email.trim().toLowerCase());
    if (!user)
      return sendErrors(res, 401, buildError("email", "invalid credentials"));

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)
      return sendErrors(
        res,
        401,
        buildError("password", "invalid credentials")
      );

    req.session.userId = user.id;
    return res.json({ user: toPublicUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    return sendErrors(res, 500, buildError("database", "Failed to login"));
  }
});

app.post("/api/auth/logout", authLimiter, async (req, res) => {
  try {
    if (!req.session) return res.status(204).send();
    req.session.destroy(() => {
      res.status(204).send();
    });
  } catch (error) {
    console.error("Logout error:", error);
    return sendErrors(res, 500, buildError("server", "Failed to logout"));
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    if (!req.session || !req.session.userId) return res.json({ user: null });
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });
    return res.json({ user: toPublicUser(user) });
  } catch (error) {
    console.error("Me error:", error);
    return sendErrors(
      res,
      500,
      buildError("server", "Failed to get current user")
    );
  }
});

// Add user profile update endpoint
app.put("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const { name, email } = req.body || {};
    const errors = [];

    if (
      email !== undefined &&
      (!isNonEmptyString(email) || !email.includes("@"))
    ) {
      errors.push(buildError("email", "valid email is required"));
    }
    if (name !== undefined && !isStringOrEmpty(name)) {
      errors.push(buildError("name", "name must be a string"));
    }

    if (errors.length) return sendErrors(res, 400, errors);

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await findUserByEmail(email);
      if (existingUser && existingUser.id !== req.session.userId) {
        return sendErrors(
          res,
          409,
          buildError("email", "email already registered")
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.session.userId },
      data: {
        ...(email && { email: email.trim().toLowerCase() }),
        ...(name !== undefined && {
          name: isStringOrEmpty(name) ? name : null,
        }),
      },
    });

    return res.json({ user: toPublicUser(updatedUser) });
  } catch (error) {
    console.error("Update profile error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to update profile")
    );
  }
});

// Add password change endpoint
app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const errors = [];

    if (!isNonEmptyString(currentPassword)) {
      errors.push(
        buildError("currentPassword", "current password is required")
      );
    }
    if (!isNonEmptyString(newPassword)) {
      errors.push(buildError("newPassword", "new password is required"));
    }
    if (newPassword && newPassword.length < 6) {
      errors.push(
        buildError("newPassword", "password must be at least 6 characters")
      );
    }

    if (errors.length) return sendErrors(res, 400, errors);

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });
    if (!user) {
      return sendErrors(res, 401, buildError("auth", "user not found"));
    }

    // Verify current password
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return sendErrors(
        res,
        401,
        buildError("currentPassword", "current password is incorrect")
      );
    }

    // Update password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.session.userId },
      data: { passwordHash: newPasswordHash },
    });

    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to change password")
    );
  }
});

// Add user deletion endpoint
app.delete("/api/auth/me", requireAuth, async (req, res) => {
  try {
    // Delete the user (cascading will handle related data)
    await prisma.user.delete({
      where: { id: req.session.userId },
    });

    // Destroy session
    if (req.session) {
      req.session.destroy(() => {});
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Delete user error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to delete user")
    );
  }
});

// helper: clone recipe for response and attach bestAttempt if present
function recipeWithBest(recipe) {
  // shallow copy to avoid modifying internal state
  const out = { ...recipe };
  const bestId = recipe.bestAttemptId || null;
  out.bestAttempt = bestId
    ? (recipe.attempts || []).find((a) => a.id === bestId) || null
    : null;
  return out;
}

// --- Create recipe
// Expected JSON body: { title: "...", body: "optional text", images: ["..."], feedback: "..." }
app.post("/api/recipes", writeLimiter, async (req, res) => {
  const payload = req.body || {};
  const errors = [];

  if (!isNonEmptyString(payload.title)) {
    errors.push(
      buildError("title", "title is required and must be a non-empty string")
    );
  }
  if (payload.body !== undefined && !isStringOrEmpty(payload.body)) {
    errors.push(buildError("body", "body must be a string"));
  }
  if (payload.feedback !== undefined && !isStringOrEmpty(payload.feedback)) {
    errors.push(buildError("feedback", "feedback must be a string"));
  }
  if (payload.images !== undefined && !Array.isArray(payload.images)) {
    errors.push(buildError("images", "images must be an array"));
  }
  if (payload.meta !== undefined && !isPlainObject(payload.meta)) {
    errors.push(buildError("meta", "meta must be an object"));
  }

  if (errors.length) return sendErrors(res, 400, errors);

  try {
    // 创建菜谱
    const recipe = await prisma.recipe.create({
      data: {
        title: payload.title.trim(),
        body: isStringOrEmpty(payload.body) ? payload.body : "",
        feedback: isStringOrEmpty(payload.feedback) ? payload.feedback : "",
        images: {
          create: ensureArray(payload.images).map((url) => ({ url })),
        },
        meta: isPlainObject(payload.meta) ? payload.meta : {},
        // Prefer the authenticated user as the author when available
        authorId:
          req.session && req.session.userId
            ? req.session.userId
            : payload.authorId || null,
      },
      include: {
        images: true,
        attempts: {
          include: {
            images: true,
          },
        },
      },
    });

    // 如果有菜谱内容，自动创建一个最佳尝试
    if (recipe.body && recipe.body.trim()) {
      const bestAttempt = await prisma.attempt.create({
        data: {
          body: recipe.body,
          feedback: recipe.feedback || "",
          recipe: {
            connect: { id: recipe.id },
          },
          images: {
            create: recipe.images.map((img) => ({ url: img.url })),
          },
          meta: recipe.meta || {},
        },
        include: {
          images: true,
        },
      });

      // 将新创建的尝试设置为最佳尝试
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: { bestAttemptId: bestAttempt.id },
      });

      // 重新获取更新后的菜谱
      const updatedRecipe = await prisma.recipe.findUnique({
        where: { id: recipe.id },
        include: {
          images: true,
          attempts: {
            include: {
              images: true,
            },
          },
        },
      });

      // Transform recipe to match the expected format
      const recipeResponse = recipeWithBest({
        ...updatedRecipe,
        images: updatedRecipe.images.map((img) => img.url),
        attempts: updatedRecipe.attempts.map((attempt) => ({
          ...attempt,
          images: attempt.images.map((img) => img.url),
        })),
      });

      res.status(201).json(recipeResponse);
    } else {
      // 如果没有菜谱内容，直接返回原始菜谱
      const recipeResponse = recipeWithBest({
        ...recipe,
        images: recipe.images.map((img) => img.url),
        attempts: recipe.attempts.map((attempt) => ({
          ...attempt,
          images: attempt.images.map((img) => img.url),
        })),
      });

      res.status(201).json(recipeResponse);
    }
  } catch (error) {
    console.error("Create recipe error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to create recipe")
    );
  }
});

// --- List recipes
app.get("/api/recipes", async (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase();
    const mine = req.query.mine === "true" || req.query.mine === true;

    // If requesting only 'mine' recipes, ensure the user is authenticated
    if (mine && (!req.session || !req.session.userId)) {
      return sendErrors(
        res,
        401,
        buildError("auth", "authentication required")
      );
    }

    const recipes = await prisma.recipe.findMany({
      include: {
        images: true,
        attempts: {
          include: {
            images: true,
          },
        },
      },
      where: mine ? { authorId: req.session.userId } : undefined,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Transform recipes to match the expected format
    let list = recipes.map((recipe) => ({
      ...recipe,
      images: recipe.images.map((img) => img.url),
      attempts: recipe.attempts.map((attempt) => ({
        ...attempt,
        images: attempt.images.map((img) => img.url),
      })),
    }));

    // Apply search filter
    if (q) {
      list = list.filter(
        (r) =>
          (r.title && r.title.toLowerCase().includes(q)) ||
          (r.body && r.body.toLowerCase().includes(q)) ||
          (r.feedback && r.feedback.toLowerCase().includes(q))
      );
    }

    // Attach bestAttempt for each recipe (if any)
    const items = list.map((r) => recipeWithBest(r));
    res.json({ total: items.length, items });
  } catch (error) {
    console.error("List recipes error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to list recipes")
    );
  }
});

// --- Get single recipe
app.get("/api/recipes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const recipe = await prisma.recipe.findUnique({
      where: { id },
      include: {
        images: true,
        attempts: {
          include: {
            images: true,
          },
        },
      },
    });

    if (!recipe)
      return sendErrors(res, 404, buildError("id", "recipe not found"));

    // Transform recipe to match the expected format
    const recipeResponse = {
      ...recipe,
      images: recipe.images.map((img) => img.url),
      attempts: recipe.attempts.map((attempt) => ({
        ...attempt,
        images: attempt.images.map((img) => img.url),
      })),
    };

    res.json(recipeWithBest(recipeResponse));
  } catch (error) {
    console.error("Get recipe error:", error);
    return sendErrors(res, 500, buildError("database", "Failed to get recipe"));
  }
});

// --- Update recipe (full replace via PUT) -- keep existing behavior
app.put("/api/recipes/:id", requireAuth, writeLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const recipe = await prisma.recipe.findUnique({
      where: { id },
      include: {
        images: true,
      },
    });

    if (!recipe)
      return sendErrors(res, 404, buildError("id", "recipe not found"));

    // only the recipe author may update
    console.log("owner-check PUT", {
      recipeId: id,
      recipeAuthorId: recipe.authorId,
      sessionUserId: req.session && req.session.userId,
      typeofAuthor: typeof recipe.authorId,
      typeofSession: typeof (req.session && req.session.userId),
    });
    if (!recipe.authorId || recipe.authorId !== req.session.userId) {
      return sendErrors(res, 403, buildError("auth", "forbidden"));
    }

    const payload = req.body || {};
    const errors = [];

    if (payload.title !== undefined && !isNonEmptyString(payload.title)) {
      errors.push(
        buildError("title", "title must be a non-empty string when provided")
      );
    }
    if (payload.body !== undefined && !isStringOrEmpty(payload.body)) {
      errors.push(buildError("body", "body must be a string"));
    }
    if (payload.feedback !== undefined && !isStringOrEmpty(payload.feedback)) {
      errors.push(buildError("feedback", "feedback must be a string"));
    }
    if (payload.images !== undefined && !Array.isArray(payload.images)) {
      errors.push(buildError("images", "images must be an array"));
    }
    if (payload.meta !== undefined && !isPlainObject(payload.meta)) {
      errors.push(buildError("meta", "meta must be an object"));
    }

    if (errors.length) return sendErrors(res, 400, errors);

    // First delete existing images
    await prisma.image.deleteMany({
      where: { recipeId: id },
    });

    // Then update the recipe and create new images
    const updatedRecipe = await prisma.recipe.update({
      where: { id },
      data: {
        title:
          payload.title !== undefined ? payload.title.trim() : recipe.title,
        body: payload.body !== undefined ? payload.body : recipe.body,
        feedback:
          payload.feedback !== undefined ? payload.feedback : recipe.feedback,
        meta: payload.meta !== undefined ? payload.meta : recipe.meta,
        images: {
          create: Array.isArray(payload.images)
            ? payload.images.map((url) => ({ url }))
            : [],
        },
      },
      include: {
        images: true,
        attempts: {
          include: {
            images: true,
          },
        },
      },
    });

    // Transform recipe to match the expected format
    const recipeResponse = {
      ...updatedRecipe,
      images: updatedRecipe.images.map((img) => img.url),
      attempts: updatedRecipe.attempts.map((attempt) => ({
        ...attempt,
        images: attempt.images.map((img) => img.url),
      })),
    };

    res.json(recipeWithBest(recipeResponse));
  } catch (error) {
    console.error("Update recipe error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to update recipe")
    );
  }
});

// --- Partial update recipe (PATCH) --- supports bestAttemptId and other partial updates
app.patch("/api/recipes/:id", requireAuth, writeLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const recipe = await prisma.recipe.findUnique({
      where: { id },
      include: {
        images: true,
      },
    });

    if (!recipe)
      return sendErrors(res, 404, buildError("id", "recipe not found"));

    console.log("owner-check PATCH", {
      recipeId: id,
      recipeAuthorId: recipe.authorId,
      sessionUserId: req.session && req.session.userId,
      typeofAuthor: typeof recipe.authorId,
      typeofSession: typeof (req.session && req.session.userId),
    });
    // only the recipe author may patch
    if (!recipe.authorId || recipe.authorId !== req.session.userId) {
      return sendErrors(res, 403, buildError("auth", "forbidden"));
    }

    const payload = req.body || {};
    const errors = [];

    if (payload.title !== undefined && !isNonEmptyString(payload.title)) {
      errors.push(
        buildError("title", "title must be a non-empty string when provided")
      );
    }
    if (payload.body !== undefined && !isStringOrEmpty(payload.body)) {
      errors.push(buildError("body", "body must be a string"));
    }
    if (payload.feedback !== undefined && !isStringOrEmpty(payload.feedback)) {
      errors.push(buildError("feedback", "feedback must be a string"));
    }
    if (payload.images !== undefined && !Array.isArray(payload.images)) {
      errors.push(buildError("images", "images must be an array"));
    }
    if (payload.meta !== undefined && !isPlainObject(payload.meta)) {
      errors.push(buildError("meta", "meta must be an object"));
    }
    if (payload.bestAttemptId !== undefined) {
      // allow null to clear bestAttemptId
      if (
        payload.bestAttemptId !== null &&
        !isNonEmptyString(payload.bestAttemptId)
      ) {
        errors.push(
          buildError(
            "bestAttemptId",
            "bestAttemptId must be a non-empty string or null"
          )
        );
      } else if (payload.bestAttemptId !== null) {
        // ensure attempt belongs to this recipe
        const found = await prisma.attempt.findUnique({
          where: { id: payload.bestAttemptId },
        });
        if (!found || found.recipeId !== id) {
          errors.push(
            buildError("bestAttemptId", "attempt not found for this recipe")
          );
        }
      }
    }

    if (errors.length) return sendErrors(res, 400, errors);

    // Prepare update data
    const updateData = {};
    if (payload.title !== undefined) updateData.title = payload.title.trim();
    if (payload.body !== undefined) updateData.body = payload.body;
    if (payload.feedback !== undefined) updateData.feedback = payload.feedback;
    if (payload.meta !== undefined) updateData.meta = payload.meta;
    if (payload.bestAttemptId !== undefined)
      updateData.bestAttemptId = payload.bestAttemptId;

    // Handle images update if provided
    let imagesData = undefined;
    if (payload.images !== undefined) {
      // First delete existing images
      await prisma.image.deleteMany({
        where: { recipeId: id },
      });

      // Prepare new images data
      imagesData = {
        create: Array.isArray(payload.images)
          ? payload.images.map((url) => ({ url }))
          : [],
      };
    }

    // Update the recipe
    const updatedRecipe = await prisma.recipe.update({
      where: { id },
      data: {
        ...updateData,
        ...(imagesData ? { images: imagesData } : {}),
      },
      include: {
        images: true,
        attempts: {
          include: {
            images: true,
          },
        },
      },
    });

    // Transform recipe to match the expected format
    const recipeResponse = {
      ...updatedRecipe,
      images: updatedRecipe.images.map((img) => img.url),
      attempts: updatedRecipe.attempts.map((attempt) => ({
        ...attempt,
        images: attempt.images.map((img) => img.url),
      })),
    };

    res.json(recipeWithBest(recipeResponse));
  } catch (error) {
    console.error("Patch recipe error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to patch recipe")
    );
  }
});

// --- Delete recipe
app.delete("/api/recipes/:id", requireAuth, writeLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const recipe = await prisma.recipe.findUnique({
      where: { id },
    });

    if (!recipe)
      return sendErrors(res, 404, buildError("id", "recipe not found"));

    console.log("owner-check DELETE", {
      recipeId: id,
      recipeAuthorId: recipe.authorId,
      sessionUserId: req.session && req.session.userId,
      typeofAuthor: typeof recipe.authorId,
      typeofSession: typeof (req.session && req.session.userId),
    });
    // only the recipe author may delete
    if (!recipe.authorId || recipe.authorId !== req.session.userId) {
      return sendErrors(res, 403, buildError("auth", "forbidden"));
    }

    // Delete dependent attempts and their images first to avoid FK constraint errors
    try {
      await prisma.$transaction(async (tx) => {
        const attempts = await tx.attempt.findMany({
          where: { recipeId: id },
          select: { id: true },
        });
        const attemptIds = attempts.map((a) => a.id);

        if (attemptIds.length) {
          // delete images attached to attempts
          await tx.image.deleteMany({
            where: { attemptId: { in: attemptIds } },
          });
          // delete attempts
          await tx.attempt.deleteMany({ where: { id: { in: attemptIds } } });
        }

        // delete images attached directly to the recipe
        await tx.image.deleteMany({ where: { recipeId: id } });

        // finally delete the recipe
        await tx.recipe.delete({ where: { id } });
      });
    } catch (innerErr) {
      console.error("Error deleting dependent data for recipe:", innerErr);
      if (innerErr && innerErr.stack) console.error(innerErr.stack);
      return sendErrors(
        res,
        500,
        buildError("database", "Failed to delete recipe")
      );
    }

    res.status(204).send();
  } catch (error) {
    console.error("Delete recipe error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to delete recipe")
    );
  }
});

// --- Add attempt to a recipe
// Expected body: { body: "描述此次尝试", feedback: "可选", images: [], meta: {} }
app.post("/api/recipes/:id/attempts", writeLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const recipe = await prisma.recipe.findUnique({
      where: { id },
    });

    if (!recipe)
      return sendErrors(res, 404, buildError("id", "recipe not found"));

    const payload = req.body || {};
    const errors = [];

    if (!isNonEmptyString(payload.body)) {
      errors.push(
        buildError(
          "body",
          "attempt body is required and must be a non-empty string"
        )
      );
    }
    if (payload.feedback !== undefined && !isStringOrEmpty(payload.feedback)) {
      errors.push(buildError("feedback", "feedback must be a string"));
    }
    if (payload.images !== undefined && !Array.isArray(payload.images)) {
      errors.push(buildError("images", "images must be an array"));
    }
    if (payload.meta !== undefined && !isPlainObject(payload.meta)) {
      errors.push(buildError("meta", "meta must be an object"));
    }

    if (errors.length) return sendErrors(res, 400, errors);

    const attempt = await prisma.attempt.create({
      data: {
        body: payload.body,
        feedback: isStringOrEmpty(payload.feedback) ? payload.feedback : "",
        recipe: {
          connect: { id },
        },
        images: {
          create: ensureArray(payload.images).map((url) => ({ url })),
        },
        meta: isPlainObject(payload.meta) ? payload.meta : {},
      },
      include: {
        images: true,
      },
    });

    // Transform attempt to match the expected format
    const attemptResponse = {
      ...attempt,
      images: attempt.images.map((img) => img.url),
    };

    res.status(201).json(attemptResponse);
  } catch (error) {
    console.error("Create attempt error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to create attempt")
    );
  }
});

// --- List attempts for a recipe
app.get("/api/recipes/:id/attempts", async (req, res) => {
  try {
    const id = req.params.id;
    const recipe = await prisma.recipe.findUnique({
      where: { id },
    });

    if (!recipe)
      return sendErrors(res, 404, buildError("id", "recipe not found"));

    const attempts = await prisma.attempt.findMany({
      where: { recipeId: id },
      include: {
        images: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Transform attempts to match the expected format
    const list = attempts.map((attempt) => ({
      ...attempt,
      images: attempt.images.map((img) => img.url),
    }));

    res.json({ total: list.length, items: list });
  } catch (error) {
    console.error("List attempts error:", error);
    return sendErrors(
      res,
      500,
      buildError("database", "Failed to list attempts")
    );
  }
});

// --- Choose an attempt as the recipe's best attempt
// POST /api/recipes/:id/attempts/:attemptId/choose
app.post(
  "/api/recipes/:id/attempts/:attemptId/choose",
  writeLimiter,
  async (req, res) => {
    try {
      const id = req.params.id;
      const attemptId = req.params.attemptId;

      // Check if recipe exists
      const recipe = await prisma.recipe.findUnique({
        where: { id },
      });
      if (!recipe)
        return sendErrors(res, 404, buildError("id", "recipe not found"));

      // Check if attempt exists and belongs to this recipe
      const attempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
      });
      if (!attempt || attempt.recipeId !== id) {
        return sendErrors(
          res,
          400,
          buildError("attemptId", "attempt not found for this recipe")
        );
      }

      // Update recipe with bestAttemptId
      const updatedRecipe = await prisma.recipe.update({
        where: { id },
        data: { bestAttemptId: attemptId },
        include: {
          images: true,
          attempts: {
            include: {
              images: true,
            },
          },
        },
      });

      // Transform recipe to match the expected format
      const recipeResponse = {
        ...updatedRecipe,
        images: updatedRecipe.images.map((img) => img.url),
        attempts: updatedRecipe.attempts.map((attempt) => ({
          ...attempt,
          images: attempt.images.map((img) => img.url),
        })),
      };

      // return updated recipe with bestAttempt attached
      res.json(recipeWithBest(recipeResponse));
    } catch (error) {
      console.error("Choose best attempt error:", error);
      return sendErrors(
        res,
        500,
        buildError("database", "Failed to choose best attempt")
      );
    }
  }
);

app.get("/api/ping", (req, res) => {
  res.json({ message: "pong", time: new Date().toISOString() });
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "..", "public")));

// For all routes that are not API routes, serve the frontend app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.post("/api/echo", (req, res) => {
  res.json({ youSent: req.body });
});

// 只有在直接运行此文件时才启动服务器
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// 导出app供测试使用
module.exports = app;
