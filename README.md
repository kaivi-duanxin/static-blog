# Kaivi Blog

Kaivi 的个人博客，基于 Next.js 16 和 React 19 构建，通过 OpenNext 部署到 Cloudflare Workers。

- 线上地址：https://shizhou.info
- 主分支：`main`
- 当前稳定版本：`main-20260921-stable`

## 当前功能

- 博客、月记、图片、项目、代码片段等内容页面
- Github App 在线编辑和提交内容
- `/book` PDF 书籍阅读器，支持左右翻页、翻页动画和页码导航
- PDF 通过同源接口和 HTTP Range 请求按需加载，不会在首次访问时下载整本书
- Cloudflare D1 持久化点赞
- 每篇文章每个浏览器每天最多点赞 100 次，跨天自动重置
- RSS 和 Sitemap

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Motion
- PDF.js
- Zustand / SWR
- OpenNext Cloudflare
- Cloudflare Workers / D1

## 本地开发

环境要求：Node.js 20+、pnpm。

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

开发地址：http://localhost:2025

Windows PowerShell 可以使用：

```powershell
Copy-Item .env.local.example .env.local
pnpm dev
```

常用命令：

```bash
pnpm dev          # 启动本地开发服务，端口 2025
pnpm build        # Next.js 生产构建
pnpm run build:cf # 构建 Cloudflare Worker
pnpm preview      # 本地预览 Cloudflare 产物
pnpm deploy       # 部署到 Cloudflare
pnpm cf-typegen   # 生成 Cloudflare Binding 类型
```

## 环境变量

以 `.env.local.example` 为模板。常用配置如下：

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_GITHUB_OWNER` | Github 仓库所有者 |
| `NEXT_PUBLIC_GITHUB_REPO` | Github 仓库名称 |
| `NEXT_PUBLIC_GITHUB_BRANCH` | 内容提交分支，当前为 `main` |
| `NEXT_PUBLIC_GITHUB_APP_ID` | Github App ID |
| `NEXT_PUBLIC_SITE_URL` | 浏览器端站点地址 |
| `SITE_URL` | 服务端站点地址 |
| `KAIVI_BOOK_URL` | PDF 文件的远程地址 |
| `NEXT_PUBLIC_BOOK_URL` | 阅读器请求地址，默认 `/api/book` |
| `LIKES_BASE_COUNT` | 新文章的基础点赞数，默认 `520` |
| `LIKES_ADMIN_TOKEN` | 管理点赞数据时使用的服务端令牌 |

密钥只能配置在本地环境或 Cloudflare 控制台中，不要提交 Github App Private Key、Cloudflare API Token 或其他服务密钥。

## Cloudflare 部署

Cloudflare 配置位于 [`wrangler.toml`](wrangler.toml)。代码推送到 `main` 后，Cloudflare Workers Builds 会自动执行：

```bash
pnpm run build:cf
```

主要部署配置：

```toml
main = ".open-next/worker.js"
name = "static-blog"

[assets]
directory = ".open-next/assets"
binding = "ASSETS"
```

Cloudflare 项目需要使用仓库根目录，并安装 pnpm 依赖后执行构建。生产环境变量在 Cloudflare Workers 项目设置中配置。

## D1 点赞数据库

点赞数据保存在 Cloudflare D1 的 `post_likes` 表中：

```text
database_name = likes
binding       = LIKES_DB
database_id   = 8b562e4c-7328-49ef-b956-73b8884e4432
```

绑定已写入 [`wrangler.toml`](wrangler.toml)，数据库迁移位于 [`migrations/0001_create_post_likes.sql`](migrations/0001_create_post_likes.sql)。首次部署或需要手动初始化时执行：

```bash
wrangler d1 migrations apply likes --remote
```

点赞接口位于 [`src/app/api/likes/route.ts`](src/app/api/likes/route.ts)。接口首次访问时也会自动创建表并初始化对应文章，因此 Cloudflare 没有自动执行 migration 时仍可正常工作。

验证生产环境：

```text
GET https://shizhou.info/api/likes?slug=home
```

正常响应中的 `provider` 应为 `d1`。

## PDF 书籍阅读器

阅读地址：https://shizhou.info/book

默认 PDF 来源：

```text
https://staticblog.s3.bitiful.net/Kaivi-books.pdf
```

阅读器通过 [`src/app/api/book/route.ts`](src/app/api/book/route.ts) 转发 PDF.js 的 Range 请求。更换书籍时只需要修改 `KAIVI_BOOK_URL`，无需改动前端阅读器。

对象存储需要：

- 支持 `GET`、`HEAD` 和 HTTP Range 请求
- 正确返回 `Accept-Ranges`、`Content-Range`、`Content-Length`、`Content-Type`
- 允许 Cloudflare Worker 访问文件

## 目录说明

```text
src/app/             页面和 API 路由
src/components/      公共组件
src/config/          站点内容和默认点赞数据
public/              静态资源
migrations/          Cloudflare D1 迁移
wrangler.toml        Cloudflare Worker 配置
open-next.config.ts  OpenNext 配置
```

## 稳定版本与回滚

当前稳定 tag：

```text
main-20260921-stable
```

查看稳定版本：

```bash
git fetch --tags
git checkout main-20260921-stable
```

恢复到主分支继续开发：

```bash
git checkout main
git pull origin main
```

如果需要让 `main` 回到某个稳定版本，应先创建备份分支或新 tag，再通过新提交恢复，避免直接覆盖远程历史。
