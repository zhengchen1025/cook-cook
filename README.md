# BetterCook

这是一个用于记录菜谱（recipes）与多次尝试（attempts）的最小 Express 后端示例，使用内存存储（非持久化）。适合本地开发与快速原型。

## 主要特性

- Health check: `GET /api/health`
- 简单的 CRUD for recipes:
  - `POST /api/recipes` — 创建 recipe（必填 `title`）
  - `GET /api/recipes` — 列表（支持 `?q=` 搜索）
  - `GET /api/recipes/:id` — 获取单条
  - `PUT /api/recipes/:id` — 更新（局部）
  - `DELETE /api/recipes/:id` — 删除
- Attempts（每次烹饪的记录）：
  - `POST /api/recipes/:id/attempts` — 为指定 recipe 添加 attempt（必填 `body`）
  - `GET /api/recipes/:id/attempts` — 列出 attempts（最新优先）
- 简单日志中间件，会在控制台输出每次请求

## 当前状态

- 已初始化项目并运行 Express 开发服务器（Node + Express + nodemon）。
- 已实现并测试的路由：
  - `GET /api/ping` — 测试接口，返回 JSON 示例 `{ "message": "pong", "time": "2025-08-22T..." }`。
  - `GET /` — 简单主页提示页面。
- 代码已托管在 GitHub（见仓库地址）。

## 项目目标

BetterCook 的目标是帮助记录并改进烹饪与烘焙实践。核心想法是把“菜品/流程/结果”三部分结构化保存，便于回顾、比较与改进，长期积累成个人的食谱与实验日志。

### 核心功能（MVP）

- 用户认证（注册 / 登录）
- 菜谱（Recipe）CRUD：标题、类别、材料、步骤、预计时间、难度、封面图片
- 实践记录（Attempt/Result）CRUD：关联菜谱、日期、结果（成功/部分成功/失败）、评分、耗时、关键调整、图片、笔记
- 列表与详情页：按类别/关键词搜索，查看菜谱历史实践记录
- 简易统计（后期）：成功率、平均评分、常见调整词频等

## 技术栈

- 后端：Node.js + Express
- 数据库：SQLite + Prisma ORM（开发）→ 部署时可换 PostgreSQL（Supabase / Railway/Render）
- 前端：React + Tailwind CSS（SPA），使用 Fetch 或 Axios 与后端交互
- 部署：前端 Vercel/Netlify，后端 Render.com

## 本地运行（开发环境）

1. 克隆仓库并进入目录：

   - `git clone <仓库地址>`
   - `cd cook-cook`

2. 安装后端依赖：

   - `npm install`

3. 安装前端依赖:

   - `cd frontend && npm install && cd ..`

4. 创建 .env 文件并设置环境变量：

   ```
   SESSION_SECRET=your-generated-secret-here
   DATABASE_URL=file:./dev.db
   PORT=4000
   ```

5. 运行数据库迁移：

   - `npx prisma migrate dev`

6. 启动开发服务器（带自动重启）：

   - `npm run dev`

7. 访问：
   - 浏览器： `http://localhost:4000`
   - 测试 API： `http://localhost:4000/api/ping`

## Day 1（已完成）

- 初始化仓库与项目结构（Node + Express）。
- 实现并运行最小 Express 服务器，确认 `/api/ping` 返回 JSON。
- 将初始代码推送到 GitHub 并记录今日进度。

## 下一步计划（短期 / Day 2）

### 短期目标（接下来 1–2 天）

- 在后端加入 JSON body 解析中间件（`express.json()`）。
- 实现基础用户注册与登录路由（占位实现，后续接数据库与 bcrypt/JWT）。
- 初始化 Prisma + SQLite，设计初步 schema（users, recipes, attempts）。
- 在 README 中记录开发步骤与学习笔记。

### 中期目标（1–2 周）

- 完成 `recipes` 与 `attempts` 的数据库 schema 与 CRUD API。
- 实现 React 前端基础页面：登录、recipes 列表、recipe 详情、添加尝试。
- 部署前后端并进行端到端测试。

## 常见命令

- 安装依赖： `npm install`
- 启动开发服务器： `npm run dev`
- 生产启动： `npm start`
- 构建前端并部署： `npm run build`
- 数据库迁移： `npx prisma migrate dev`
- 查看可用脚本： `npm run`

## 贡献与反馈

这是个人学习与实践项目，欢迎提出建议或打开 issue。若你想贡献代码，请先在 issue 里描述想实现的功能，再创建分支提交 PR。

## 部署到 Render.com

1. 将代码推送到 GitHub 仓库

2. 登录 Render.com 并连接你的 GitHub 账户

3. 创建一个新的 Web Service：

   - 选择你的仓库
   - 设置以下环境变量：
     - `SESSION_SECRET` - 一个安全的随机字符串（至少 32 字符）
     - `DATABASE_URL` - `file:./prod.db` 或使用 Render 的 PostgreSQL 服务
   - Render 会自动检测并运行构建和启动命令

4. 部署完成后，你的应用将可以通过 Render 提供的 URL 访问

   ### 在 Render 上确保会话（登录）正常工作

   在 Render（或任何托管在反向代理后的平台）上运行时，请确保以下环境变量与设置：

   - `NODE_ENV=production` — 使服务以生产模式运行，并在服务端启用 secure session cookie（仅在 HTTPS 下发送）。
   - `SESSION_SECRET` — 一个安全的随机字符串（至少 32 字符），用于签名 session cookie。
   - `DATABASE_URL` — 推荐使用 Render 提供的 PostgreSQL 服务或其他托管数据库（例如 `postgres://...`），也可以在小型部署中用 `file:./prod.db`。
   - `FRONTEND_ORIGIN` — 你的前端应用的 origin（例如 `https://your-frontend.onrender.com`）。后端会将 CORS origin 设置为此值并允许带凭证请求。

   注意事项：

   - 因为 Render 在 HTTPS 反向代理后面运行，后端需要信任代理以便正确设置 `secure` cookie。代码中已经通过 `app.set('trust proxy', 1)` 处理。务必把 `NODE_ENV` 设为 `production`，以便在生产环境使用 `cookie.secure=true`。
   - 前端发起登录请求时必须带上凭证（cookies）：fetch 请求应使用 `credentials: 'include'`。前端代码中已使用该设置。
   - 登录后如果看不到跳转或登录状态没有保留，请在浏览器 DevTools 的 Network/Storage 中确认 `Set-Cookie` header 是否存在并且 Cookie 被保存。

   示例 Render env 设置片段（`render.yaml` 已包含示例）:

   ```yaml
   envVars:
      - key: NODE_ENV
         value: production
      - key: SESSION_SECRET
         sync: false
      - key: DATABASE_URL
         sync: false
      - key: FRONTEND_ORIGIN
         value: https://your-frontend.onrender.com
   ```

## 项目结构

- `/src` - 后端源代码
- `/frontend` - 前端源代码 (React)
- `/prisma` - Prisma schema 和迁移文件
- `/public` - 静态文件目录（构建后的前端文件将存放在这里）

## 作者

- zhengchen1025 (GitHub)
