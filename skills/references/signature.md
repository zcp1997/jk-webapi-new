# 签名与编解码模块 — `src/lib/signature.ts`

处理请求签名、Base64 编解码、请求体构建的工具函数集合。

---

## 常量

```ts
DEFAULT_URL = 'http://localhost:1725/interface/UpLoadData'
```

默认接口地址，新建预设和空表单的初始值都引用此常量。

---

## 时间戳

```ts
generateTimestamp(date?: Date): string
// 输出格式: "YYYYMMDDHHmmss"，例如 "20240515143022"
```

---

## Base64 编解码（UTF-8 安全）

```ts
encodeBase64Utf8(input: string): string
// TextEncoder → btoa，正确处理中文字符

decodeBase64Utf8(input: string): string
// atob → TextDecoder，与 encode 对称
```

> 注意：`page.tsx` 中还有一个同名的局部函数 `decodeBase64Utf8`，带有 normalizeBase64 容错逻辑（处理 data URI 前缀、URL-safe Base64、缺失 padding），用于解码历史记录中的响应体，与此处的 `lib/signature.ts` 版本不同。

---

## 签名算法

```ts
createSign(timestamp: string, base64Data: string, password: string): string
// MD5(timestamp + base64Data + password).toUpperCase()
// 依赖: crypto-js/md5 + crypto-js/enc-utf8
```

**完整签名规则**（界面底部也有注释）：
```
sign = MD5(timestamp + Base64(UTF-8(data)) + password).toUpperCase()
```

---

## 构建请求数据

```ts
buildRequestData(form: WorkspaceForm, timestamp?: string): GeneratedRequestData
```

内部流程：
1. `encodeBase64Utf8(form.data)` → base64Data
2. `generateTimestamp()` → timestamp（可外部传入，用于测试）
3. `createSign(timestamp, base64Data, form.password)` → sign
4. 返回 `{ appkey, timestamp, data: base64Data, sign, ver }`

---

## 构建 FormData

```ts
toMultipartFormData(data: GeneratedRequestData): FormData
// 将 GeneratedRequestData 的所有字段 set 到 FormData
// Content-Type 由浏览器自动设为 multipart/form-data
```

字段列表：`appkey`, `timestamp`, `data`, `sign`, `ver`

---

## 格式化 JSON

```ts
prettyJson(value: string): string
// JSON.parse + JSON.stringify(_, null, 2)
// 解析失败时原样返回，不抛异常
```
