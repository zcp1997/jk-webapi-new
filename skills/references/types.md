# 类型定义 — `src/lib/types.ts`

项目所有核心数据结构的 TypeScript 接口定义。

---

## PresetNode（联合类型）

```ts
type PresetNode = ProjectNode | EndpointNode;
```

侧边栏预设树的节点，用 `type` 字段区分两种节点。

---

## ProjectNode

```ts
interface ProjectNode {
  id: string;           // 格式: "proj_xxxxxxxx"（nanoid 8位）
  name: string;
  description?: string;
  type: 'project';
  children: EndpointNode[];
}
```

代表一个项目文件夹，包含若干接口预设。至少保留 1 个项目。

---

## EndpointNode

```ts
interface EndpointNode {
  id: string;           // 格式: "preset_xxxxxxxx"（nanoid 8位）
  name: string;
  type: 'endpoint';
  url: string;          // 目标接口地址
  appkey: string;
  password: string;     // 仅用于签名，不明文传输
  ver: string;          // 接口版本号，默认 "1"
  dataTemplate: string; // 存储明文 JSON 模板
}
```

代表一个具体接口预设，持久化到 `presets.json`。至少保留 1 个预设。

---

## WorkspaceForm

```ts
interface WorkspaceForm {
  url: string;
  appkey: string;
  password: string;
  ver: string;
  data: string;   // 当前工作区的明文 JSON Payload
}
```

主工作区的表单状态，与 `EndpointNode` 的区别是 `data` 对应 `dataTemplate`，且不含 `id`/`name`/`type`。

---

## GeneratedRequestData

```ts
interface GeneratedRequestData {
  appkey: string;
  timestamp: string;  // 格式: "YYYYMMDDHHmmss"
  data: string;       // Base64(UTF-8(JSON))
  sign: string;       // MD5(timestamp + data + password).toUpperCase()
  ver: string;
}
```

最终发送给服务端的请求体字段（以 `multipart/form-data` 格式传输）。

---

## HistoryRecord

```ts
interface HistoryRecord {
  id: string;                        // 格式: "hist_xxxxxxxxxx"（nanoid 10位）
  requestTime: number;               // Date.now() 毫秒时间戳
  presetName: string;                // "项目名 - 接口名" 或 "未关联预设"
  url: string;
  requestData: GeneratedRequestData; // 发送时的完整签名参数（含 Base64 data）
  responseCode: number | null;       // HTTP 状态码，网络异常时为 null
  responseBody: string;              // 原始响应文本（可能为 Base64 或纯文本）
}
```

最多保留最新 300 条（由 `writeHistory` 的 `slice(0, 300)` 保证）。
