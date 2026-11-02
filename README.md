# 看见未见 · OH卡备用入口

网页由 GitHub Pages 托管，Supabase Edge Function `oh-backup` 将固定的 session/status/chat 请求转发给现有 AI 服务。

- 原网站保留：https://kanjianweijian-oh.yaoyutao666.chatgpt.site
- 备用网址：https://bubble200.github.io/kanjianweijian-oh/
- 规则与全站每天200次调用额度由现有服务统一执行，不另增额度。
- 备用访客可能共用出口IP的每分钟6次短时限额。
- DeepSeek密钥不进入本仓库、浏览器或Supabase函数；访客cookie仅在服务端请求中使用。
- 记忆与回顾仍保存在各自网址的浏览器存储，不自动迁移或跨网址同步。
- 这是备用访问入口，仍依赖原AI服务；不是独立的后端灾备。

## 维护

`backend/index.ts` 是Supabase函数源代码，`backend/test.mjs`验证来源、固定目标、限额传递和cookie隔离。使用 `node --test backend/test.mjs`。前端保持原网站玩法，仅适配项目子路径、跨域连接和说明。无需数据库迁移，不更改单词本数据。
