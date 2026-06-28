# ChildOS PWA 全链路操作记录

这份文档记录当前跑通的 ChildOS PWA 到 Agnes，再到 LifeOS ingest 的完整链路。本文档属于公开工具仓库说明，只记录抽象流程，不保存真实家庭数据、真实对话、真实复盘或任何 API Key。

## 当前链路

1. 用户打开 ChildOS PWA：
   - 线上地址由 Vercel 托管。
   - 前端页面是 `index.html`。

2. 用户输入一个家庭场景，点击“生成行动决策”：
   - 前端请求 `POST /api/childos-decision`。
   - 请求内容包含：
     - `scene`
     - `currentShortTermGoal`

3. ChildOS 后端代理调用 Agnes：
   - 文件：`api/childos-decision.js`
   - 从 Vercel 环境变量读取：
     - `AGNES_API_KEY`
     - `AGNES_API_URL`
     - `AGNES_MODEL`
   - 当前 Agnes URL 使用 chat completions 形式：
     - `https://apihub.agnes-ai.com/v1/chat/completions`
   - API Key 只在服务端使用，不写入前端。

4. Agnes 返回行动决策卡：
   - 前端固定展示五段：
     - 当前判断
     - 现在只做
     - 不要做
     - 对孩子说
     - 复盘点

5. 用户可以点击“生成 LifeOS 记录”：
   - 前端只生成可复制的 markdown 文本。
   - 不自动写入 GitHub。
   - 不自动写入 LifeOS。
   - 不保存历史。

6. 用户可以点击“写入 LifeOS”：
   - 前端请求 `POST /api/lifeos/write`。
   - 请求内容由当前页面内已有结果组装：
     - `type`
     - `context`
     - `short_term_goal`
     - `decision`
     - `timestamp`

7. ChildOS 写入接口先完成本地写入，再尝试同步 LifeOS：
   - 文件：`api/lifeos/write.js`
   - 本地开发写入 `data/lifeos.json`。
   - Vercel 上临时写入 `/tmp/data/lifeos.json`，这不是长期存储。
   - 如果配置了 `LIFEOS_INGEST_URL`，会继续 POST 到 LifeOS：
     - `https://<lifeos-domain>/api/lifeos/ingest`

8. LifeOS ingest 接收 ChildOS 记录：
   - 路径：`/api/lifeos/ingest`
   - 该接口必须做真正持久化。
   - 不应写 `/var/task`、`/tmp` 或内存变量。
   - 推荐写入 Vercel KV / Redis。
   - 也可以写入 GitHub 仓库文件并 commit。
   - 成功时必须返回：
     ```json
     {
       "success": true
     }
     ```

9. ChildOS 根据 LifeOS 返回值展示同步状态：
   - 只有 LifeOS 返回 `success === true`，才显示：
     - `已同步到 LifeOS（sync_status: synced）`
   - 如果 LifeOS 没有成功确认，显示：
     - `仅本地写入成功（未同步LifeOS）（sync_status: failed）`
   - 如果没有配置 `LIFEOS_INGEST_URL`，显示：
     - `仅本地写入成功（未同步LifeOS）（sync_status: local_only）`

## Vercel 配置

### childos-pwa 项目

在 Vercel 的 childos-pwa 项目中配置：

- `AGNES_API_KEY`
- `AGNES_API_URL`
- `AGNES_MODEL`
- `LIFEOS_INGEST_URL`
- `DEBUG_AGNES`

其中：

- `AGNES_API_URL` 当前应填：
  - `https://apihub.agnes-ai.com/v1/chat/completions`
- `LIFEOS_INGEST_URL` 应填 LifeOS 项目的 ingest 地址：
  - `https://<lifeos-domain>/api/lifeos/ingest`
- `DEBUG_AGNES` 只用于临时排查，平时可以不配置或设为非 `true`。

### LifeOS 项目

LifeOS 项目需要自己配置持久化能力。推荐使用 Vercel KV / Redis。

LifeOS 的 `/api/lifeos/ingest` 必须：

- 接收 ChildOS POST 过来的 JSON。
- 给每条记录补齐或保留：
  - `id`
  - `timestamp`
  - `source: "childos-pwa"`
  - `type`
  - `context`
  - `short_term_goal`
  - `decision`
- append 保存，不覆盖旧记录。
- 成功后返回 `{ "success": true }`。

## GitHub 和 Vercel 部署操作

1. 在本地修改代码。
2. 用 GitHub Desktop 检查改动。
3. commit 到 `main`。
4. push 到 GitHub。
5. Vercel 会自动触发 Production Deployment。
6. 等 Vercel 显示 `Ready`。
7. 打开线上页面测试。

通常不需要手工部署。只有以下情况需要手动处理：

- Vercel 没有连接 GitHub 仓库。
- 环境变量刚改完，需要重新部署一次。
- 上一次部署失败，需要重新部署。

## 验证方法

### 验证 AI 链路

1. 打开 ChildOS PWA。
2. 输入抽象测试场景，例如：
   - “孩子作业没完成，我有点着急”
3. 点击“生成行动决策”。
4. 页面应显示“当前使用：AI 决策”。
5. 浏览器 Network 中 `/api/childos-decision` 应返回 200。

### 验证 LifeOS 同步链路

1. 先生成行动决策卡。
2. 点击“写入 LifeOS”。
3. 页面应显示以下三种之一：
   - `sync_status: synced`：已经同步到 LifeOS。
   - `sync_status: failed`：ChildOS 本地写入成功，但 LifeOS 没确认成功。
   - `sync_status: local_only`：没有配置 LifeOS ingest 地址。
4. 浏览器 Network 中 `/api/lifeos/write` 应返回 200。
5. 如果同步成功，返回 JSON 中应包含：
   ```json
   {
     "success": true,
     "sync_status": "synced"
   }
   ```
6. Vercel Logs 中 LifeOS 项目应看到：
   - `POST /api/lifeos/ingest`
   - status 200

## 常见问题

### Agnes 返回 404

通常是 `AGNES_API_URL` 填错。当前应使用完整 chat completions 地址：

```text
https://apihub.agnes-ai.com/v1/chat/completions
```

### Agnes 返回 401

通常是 `AGNES_API_KEY` 配置错误或没有重新部署。

### LifeOS 返回 500，并出现 EROFS

这说明 LifeOS 仍在尝试写 Vercel 只读路径，例如：

```text
/var/task/data/lifeos.json
```

解决方式：把 LifeOS ingest 改成真正持久化存储，例如 Vercel KV / Redis，或 GitHub commit 写入。

### ChildOS 显示 local_only

说明 childos-pwa 项目没有配置 `LIFEOS_INGEST_URL`。

### ChildOS 显示 failed

说明 ChildOS 已经请求 LifeOS，但 LifeOS 没有返回 `{ "success": true }`。

需要检查：

- LifeOS ingest URL 是否正确。
- LifeOS 项目是否已部署最新代码。
- LifeOS Logs 中 `/api/lifeos/ingest` 的真实错误。

## 隐私边界

- 不把真实家庭数据写入 childos-pwa 仓库。
- 不把 API Key 写入代码。
- 不把真实场景写入 README 或文档示例。
- ChildOS PWA 只做工具和代理。
- LifeOS 才是私有记录承接方。
- 记录进入 LifeOS 必须由用户主动点击触发。
