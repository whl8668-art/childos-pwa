# ChildOS PWA

ChildOS PWA 是一个面向家庭真实场景的轻量行动决策工具，用于帮助妈妈在焦虑或冲突时收敛为一个低压力、可执行、不伤害关系的行动。

## 仓库边界

本仓库是公开工具仓库，只保存前端工具代码、后端代理代码、抽象规则和非真实数据。

本仓库不保存真实家庭数据。真实记录、真实对话、复盘内容和孩子个人信息不应提交到本仓库。

## 当前版本

v2.6：记录沉淀 + 短期目标可编辑版。

页面常驻展示：

- 当前短期目标，可在页面内临时编辑
- 孩子长期培养目标
- 妈妈刹车提醒
- 系统边界提醒

用户输入场景后，前端会请求 `/api/childos-decision`。后端代理使用服务端环境变量调用 Agnes API，并把当前短期目标和场景一起传给模型。

行动决策卡生成后，页面可以生成一段可复制的 LifeOS markdown 记录。记录只生成文本，不会自动写入 GitHub、LifeOS、数据库或任何外部系统。

页面也提供“写入 LifeOS”按钮。只有用户主动点击该按钮时，前端才会请求 `/api/lifeos/write`。当前该接口只打印收到的 JSON 并返回成功，暂时不接数据库。

## 部署方式

推荐部署到 Vercel。GitHub Pages 可以托管静态页面，但不能安全保存 API Key，也不能运行后端代理接口。

## 环境变量

在 Vercel 项目中配置：

- `AGNES_API_KEY`
- `AGNES_API_URL`
- `AGNES_MODEL`
- `DEBUG_AGNES`：可选，默认关闭时只保留状态摘要；临时排查接口问题时设为 `true`，会输出脱敏 headers、request body 和 Agnes raw response。

`AGNES_API_KEY` 只在服务端读取，不能写入 `index.html` 或任何前端代码。

## 本地运行

安装依赖：

```bash
npm install
```

启动 Vercel 本地开发服务：

```bash
npm run dev
```

如果没有配置 Agnes 环境变量，页面仍可打开，但点击生成会显示 AI 调用失败。配置环境变量后才会返回 AI 动态结果。

## 隐私声明

- 不登录
- 不建库
- 不保存输入
- 不写入历史
- 不使用长期记忆
- 不做孩子画像
- 不自动读取 LifeOS
- 不自动写入 LifeOS，只有用户点击“写入 LifeOS”才会发送本次记录

API 请求只用于本次生成或用户主动写入，不在 childos-pwa 中做持久化。当前 `/api/lifeos/write` 只作为接收桩接口，不接数据库。
