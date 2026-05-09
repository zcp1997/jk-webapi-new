# 存储模块 (`src/lib/store.ts`)

## 概述

统一封装预设与历史记录的持久化读写。根据运行环境自动选择存储后端：

| 环境 | 存储后端 | 存储位置 |
|------|----------|----------|
| Tauri 桌面端 | `@tauri-apps/plugin-store` | AppData 目录下的 JSON 文件 |
| 浏览器 / 开发模式 | `localStorage` | 命名空间键，见下方 |

---

## 常量

| 常量 | 值 |
|------|----|
| `PRESETS_STORE_FILE` | `'presets.json'` |
| `HISTORY_STORE_FILE` | `'history.json'` |
| `PRESETS_KEY` | `'presets'` |
| `HISTORY_KEY` | `'history'` |

localStorage 键名格式（由内部 `localStorageKey(fileName, key)` 生成）：

```
internal-api-push-tool:<fileName>:<key>
// 例：internal-api-push-tool:presets.json:presets
```

---

## 环境检测

```ts
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
```

SSR 阶段（`window` 未定义）时 `readStoreValue` / `writeStoreValue` 直接 early-return，不访问任何存储。

---

## 底层泛型 API（已导出）

### `readStoreValue<T>(fileName, key, fallback): Promise<T>`

- Tauri：`Store.load(fileName)` → `store.get<T>(key)`，无值时返回 `fallback`
- 浏览器：`localStorage.getItem(namespaced key)`，JSON.parse 后返回；无值时返回 `fallback`
- `fallback` 参数取代了返回 `null` 的设计，调用方无需做 null 检查

### `writeStoreValue<T>(fileName, key, value): Promise<void>`

- Tauri：`store.set(key, value)` 后**显式调用 `store.save()`** 确保写盘
- 浏览器：`localStorage.setItem(namespaced key, JSON.stringify(value))`

---

## 导出的类型化封装

### `readPresets(): Promise<PresetNode[]>`

读取预设列表，无数据时返回 `defaultPresets`。

### `writePresets(value: PresetNode[]): Promise<void>`

写入预设列表，无额外处理。

### `readHistory(): Promise<HistoryRecord[]>`

读取历史记录，无数据时返回 `[]`。

### `writeHistory(value: HistoryRecord[]): Promise<void>`

写入历史记录，**写入前截断到最多 300 条**：

```ts
value.slice(0, 300)
```

调用方负责将新记录插入头部（`[newRecord, ...existing]`），此函数仅裁剪上限。

---

## 导出的默认数据

### `sampleDataTemplate`

默认数据模板字符串（JSON 格式）：

```json
{
  "接口类型": "入库单",
  "接收系统标识": "JKWMS",
  "接口数据": {}
}
```

### `defaultEndpoint: EndpointNode`

```ts
{
  id: 'preset_1',
  name: '入库单',
  type: 'endpoint',
  url: DEFAULT_URL,
  appkey: '1',
  password: '1',
  ver: '1',
  dataTemplate: sampleDataTemplate
}
```

### `defaultPresets: PresetNode[]`

```ts
[{
  id: 'proj_1',
  name: 'WMS仓储系统',
  description: '默认示例项目，可按需修改或删除。',
  type: 'project',
  children: [defaultEndpoint]
}]
```

---

## 注意事项

- Tauri 端显式调用 `store.save()`，与旧版 `autoSave` 选项不同；每次写操作均立即持久化
- localStorage 键加了 `internal-api-push-tool:` 命名空间前缀，避免与页面其他键冲突
- `defaultEndpoint` 和 `defaultPresets` 是**导出常量**，可在其他模块（如 `page.tsx`）直接引用
- 历史上限 300 条由 `writeHistory` 强制，`readHistory` 读取全量不裁剪
