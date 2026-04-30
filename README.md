# Internal API Push Tool

一个基于 **Tauri v2** + **Next.js 15** + **Tailwind CSS** 构建的跨平台桌面应用程序。旨在提供高效、安全的内部 API 数据推送与管理解决方案。

## 技术栈

- **前端框架**: [Next.js 15](https://nextjs.org/) (React 19)
- **桌面框架**: [Tauri v2](https://v2.tauri.app/) (Rust)
- **UI 样式**: [Tailwind CSS](https://tailwindcss.com/)
- **图标库**: [Lucide React](https://lucide.dev/)
- **工具库**: 
  - `crypto-js`: 数据加密/解密
  - `nanoid`: 唯一 ID 生成
  - `clsx`: 类名管理

## 功能特性

- 🚀 **轻量高效**: 基于 Tauri，使用系统 WebView，打包体积小，运行性能高。
- 🔒 **安全可靠**: 内置加密支持，保障数据传输与存储安全。
- 📦 **本地存储**: 利用 `@tauri-apps/plugin-store` 实现本地持久化配置。
- 🌐 **HTTP 请求**: 集成 `@tauri-apps/plugin-http` 处理 API 推送逻辑。
- 🖥️ **现代 UI**: 响应式设计，最小支持分辨率 1080x720。

## 开始使用

### 环境要求

请确保你的开发环境满足 Tauri 的[前置要求](https://v2.tauri.app/start/prerequisites/)：

- **Node.js**: >= 18 (推荐使用最新 LTS 版本)
- **Rust**: 最新稳定版
- **系统依赖**: 
  - Windows: Microsoft Visual Studio C++ Build Tools
  - macOS: Xcode Command Line Tools
  - Linux: WebKit2GTK, OpenSSL 等

### 安装依赖

```bash
npm install
# 或
pnpm install
```

### 开发模式

启动 Next.js 开发服务器并运行 Tauri 窗口：

```bash
npm run tauri:dev
```

### 构建发布

构建生产环境的可执行文件：

```bash
npm run tauri:build
```

构建产物通常位于 `src-tauri/target/release/bundle/` 目录下。

## 项目结构

```
.
├── src/                  # Next.js 前端源码
├── src-tauri/            # Tauri 后端源码
│   ├── src/              # Rust 代码
│   ├── icons/            # 应用图标资源
│   └── tauri.conf.json   # Tauri 配置文件
├── public/               # 静态资源
└── package.json          # Node.js 依赖配置
```

## 配置说明

主要配置文件位于 `src-tauri/tauri.conf.json`：

- **窗口配置**: 默认宽度 1320px，高度 860px。
- **安全策略**: 当前 CSP 设置为 `null`，生产环境建议根据实际需求配置内容安全策略。