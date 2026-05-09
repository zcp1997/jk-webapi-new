# JKWEB API — Skills 索引

本目录记录项目各核心模块的技术参考文档，供开发时快速查阅。

## 目录结构

```
skills/
├── SKILL.md                    # 本文件，总索引
└── references/
    ├── types.md                # 数据类型定义
    ├── signature.md            # 签名与编解码逻辑
    ├── store.md                # 本地持久化存储
    ├── ui-page.md              # 主页面 UI 与状态管理
    └── tauri-backend.md        # Tauri 后端与插件配置
```

## 模块速览

| 模块 | 文件 | 职责 |
|------|------|------|
| 类型定义 | [references/types.md](references/types.md) | 所有核心 TS 接口与类型 |
| 签名模块 | [references/signature.md](references/signature.md) | 时间戳生成、Base64、MD5 签名、请求构建 |
| 存储模块 | [references/store.md](references/store.md) | 预设与历史记录的读写，Tauri/localStorage 双模式 |
| 主页面 | [references/ui-page.md](references/ui-page.md) | UI 布局、状态机、拖拽排序、请求发送流程 |
| Tauri 后端 | [references/tauri-backend.md](references/tauri-backend.md) | Rust 入口、插件注册、HTTP/Store 插件 |
