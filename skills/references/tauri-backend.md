# Tauri 后端配置 — `src-tauri/`

桌面应用的 Rust 层，当前极薄，仅负责插件注册和窗口启动。

---

## 入口文件

### `src-tauri/src/main.rs`
Rust 可执行入口，调用 `lib.rs` 的 `run()`。

### `src-tauri/src/lib.rs`

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

注册了两个插件，无自定义 Tauri 命令（`invoke`）。

---

## 插件

| 插件 | 前端包 | 用途 |
|------|--------|------|
| `tauri_plugin_http` | `@tauri-apps/plugin-http` | 替代浏览器 `fetch`，绕过 WebView 的跨域限制，向内网接口发请求 |
| `tauri_plugin_store` | `@tauri-apps/plugin-store` | 键值对持久化，数据存储在系统 AppData 目录下的 JSON 文件 |

---

## 权限配置 — `src-tauri/capabilities/default.json`

控制前端可调用的 Tauri API 范围（ACL）。

---

## 窗口配置 — `src-tauri/tauri.conf.json`（关键参数）

| 参数 | 值 |
|------|----|
| 默认窗口尺寸 | 1320 × 860 px |
| 最小窗口尺寸 | 1080 × 720 px |
| CSP | `null`（开发阶段未配置，生产建议按需设置） |

---

## 构建产物

```
src-tauri/target/release/bundle/
```

运行 `npm run tauri:build` 后生成平台安装包（Windows: `.msi` / `.exe`）。

---

## 前端环境检测

前端通过以下方式判断是否运行在 Tauri 容器中：

```ts
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
```

- **Tauri 环境**：使用 `tauriFetch` + `plugin-store`
- **浏览器环境**（`next dev`）：使用原生 `fetch` + `localStorage`
