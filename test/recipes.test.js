const request = require('supertest');
const { PrismaClient } = require('@prisma/client');

const app = require('../src/index');
const prisma = new PrismaClient();

describe('Recipe API', () => {
  // 在每个测试之前清理数据库
  beforeEach(async () => {
    await prisma.attempt.deleteMany();
    await prisma.image.deleteMany();
    await prisma.recipe.deleteMany();
  });

  // 在所有测试完成后断开数据库连接
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/recipes', () => {
    it('should create a new recipe', async () => {
      const newRecipe = {
        title: 'Test Recipe',
        body: 'Test recipe body',
        feedback: 'Test feedback'
      };

      const response = await request(app)
        .post('/api/recipes')
        .send(newRecipe)
        .expect(201);

      expect(response.body.title).toBe(newRecipe.title);
      expect(response.body.body).toBe(newRecipe.body);
      expect(response.body.feedback).toBe(newRecipe.feedback);
      expect(response.body.id).toBeDefined();
    });

    it('should return 400 if title is missing', async () => {
      const newRecipe = {
        body: 'Test recipe body'
      };

      const response = await request(app)
        .post('/api/recipes')
        .send(newRecipe)
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].field).toBe('title');
    });
  });

  describe('GET /api/recipes', () => {
    it('should retrieve a list of recipes', async () => {
      // 创建测试数据
      await prisma.recipe.create({
        data: {
          title: 'Test Recipe 1',
          body: 'Test recipe body 1'
        }
      });

      await prisma.recipe.create({
        data: {
          title: 'Test Recipe 2',
          body: 'Test recipe body 2'
        }
      });

      const response = await request(app)
        .get('/api/recipes')
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });
  });
});