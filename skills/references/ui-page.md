# 主页面 UI 与状态管理 — `src/app/page.tsx`

单文件客户端组件（`'use client'`），包含全部 UI 渲染、状态管理和业务逻辑（约 1190 行）。

---

## 布局结构

```
<main> 全屏 flex 水平布局
├── <aside> 侧边栏 (w-72 / lg:w-80)
│   ├── 顶部 Logo + 暗色主题切换
│   ├── Tab 切换：预设配置 / 历史记录
│   └── 内容区（可滚动）
│       ├── [预设配置] 搜索框 + 新建项目按钮 + DnD 项目列表
│       └── [历史记录] 搜索框 + 状态过滤 + 历史记录卡片列表
└── <section> 主工作区
    ├── <header> 请求栏：POST 标签 + URL 输入 + Send 按钮
    ├── 工作区 Grid (lg:grid-cols-2)
    │   ├── 左列：Base Parameters + Payload JSON 编辑器
    │   └── 右列：最终请求预览 + Base64 Data 预览（可折叠）+ 响应结果
    ├── <footer> 状态栏：状态指示点 + 状态文字 + Content-Type 标注
    └── 弹窗层（z-50）：deleteDialog / createDialog
```

---

## 核心状态

| State | 类型 | 说明 |
|-------|------|------|
| `presets` | `PresetNode[]` | 完整预设树，从 store 加载 |
| `history` | `HistoryRecord[]` | 历史记录，按时间倒序 |
| `selectedEndpointId` | `string \| null` | 当前选中的预设接口 ID |
| `form` | `WorkspaceForm` | 工作区表单（url/appkey/password/ver/data） |
| `generated` | `GeneratedRequestData \| null` | 上一次实际发送的签名参数 |
| `liveRequestPreview` | `GeneratedRequestData \| null` | 随 form 实时更新的预览（未发送） |
| `sending` | `boolean` | 请求发送中标志 |
| `response` / `responseCode` | `string` / `number \| null` | 最近一次响应 |
| `createDialog` / `deleteDialog` | 弹窗状态 \| null | 控制新建/删除确认弹窗 |

---

## 请求发送流程（`sendRequest`）

```
1. buildRequestData(form) → requestData（生成签名）
2. tauriAwareFetch(url, { method: 'POST', body: toMultipartFormData(requestData) })
   - 超时: 30000ms（AbortController）
   - 环境: Tauri → tauriFetch，浏览器 → fetch
3. 响应处理：
   - res.text() → getResponseText()
   - getResponseText: 先尝试 decodeBase64Utf8，若解码结果为 JSON 则展示解码后内容，否则展示原文
4. 错误分类：AbortError（超时）/ 网络错误 / 其他异常
5. finally: 无论成功失败都写入历史记录
```

---

## 拖拽排序（dnd-kit）

- **项目间排序**：`SortableContext` 包裹项目列表，`activeId` 不在任何 endpoint children 中时视为 project
- **预设间排序**：`SortableContext` 在 `SortableProject` 内部，只支持同项目内排序（跨项目拖拽无效）
- 拖拽激活距离：8px（防止点击误触）
- `DragOverlay`：拖拽时显示浮层预览卡片

---

## 预设管理约束

- 至少保留 **1 个项目**，至少保留 **1 个预设接口**（删除时前置校验）
- 新建项目时自动创建一个"默认接口预设"，并继承当前工作区表单的参数
- 保存预设（`saveCurrentPreset`）将当前 form 写回选中的 `EndpointNode`

---

## 组件

### `EditableText`
双击进入编辑模式，Enter 提交，Escape 取消，失焦自动提交，空值不保存。

### `SortableProject`
可拖拽的项目卡片，包含 `SortableEndpoint` 子列表。

### `SortableEndpoint`
可拖拽的接口预设行，Grip 图标 hover 时才显示。

---

## 历史记录回显（`loadHistory`）

从历史记录加载时，会尝试 `decodeBase64Utf8` 还原明文 Payload 填回表单，password 字段不存储故无法回填（需手动重新输入后才能重发）。

---

## 暗色主题

初始化时强制设为暗色（`document.documentElement.classList.toggle('dark', true)`），用户可通过按钮切换，不持久化到 store。
