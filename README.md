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

## 技术栈（计划）
- 后端：Node.js + Express  
- 数据库（开发）：SQLite（轻量、免配置）→ 部署时可换 PostgreSQL（Supabase / Railway）  
- ORM：Prisma（可选，推荐）  
- 前端：React + Tailwind CSS（SPA），使用 Fetch 或 Axios 与后端交互  
- 部署：前端 Vercel/Netlify，后端 Railway/Render/Heroku（任选）

## 本地运行（开发环境）
1. 克隆仓库并进入目录：  
   - `git clone <仓库地址>`  
   - `cd cook-cook`
2. 安装依赖：  
   - `npm install`
3. 启动开发服务器（带自动重启）：  
   - `npm run dev`
4. 访问：  
   - 浏览器： `http://localhost:4000`  
   - 测试 API： `http://localhost:4000/api/ping`

（如果后续引入数据库和环境变量，会在此处补充 `.env` 配置说明）

## Day 1（已完成）
- 初始化仓库与项目结构（Node + Express）。
- 实现并运行最小 Express 服务器，确认 `/api/ping` 返回 JSON。
- 将初始代码推送到 GitHub并记录今日进度。

## 下一步计划（短期 / Day 2）
### 短期目标（接下来 1–2 天）
- 在后端加入 JSON body 解析中间件（`express.json()`）。  
- 实现基础用户注册与登录路由（占位实现，后续接数据库与 bcrypt/JWT）。  
- 初始化 Prisma + SQLite（或选择 PostgreSQL），设计初步 schema（users, recipes, attempts）。  
- 在 README 中记录开发步骤与学习笔记。

### 中期目标（1–2 周）
- 完成 `recipes` 与 `attempts` 的数据库 schema 与 CRUD API。  
- 实现 React 前端基础页面：登录、recipes 列表、recipe 详情、添加尝试。  
- 部署前后端并进行端到端测试。

## 常见命令
- 安装依赖： `npm install`  
- 启动开发服务器： `npm run dev`  
- 生产启动： `npm start`  
- 查看可用脚本： `npm run`

## 贡献与反馈
这是个人学习与实践项目，欢迎提出建议或打开 issue。若你想贡献代码，请先在 issue 里描述想实现的功能，再创建分支提交 PR。

## 作者
- zhengchen1025 (GitHub)