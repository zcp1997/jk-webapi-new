import { DEFAULT_URL } from './signature';
import type { EndpointNode, HistoryRecord, PresetNode } from './types';

const PRESETS_STORE_FILE = 'presets.json';
const HISTORY_STORE_FILE = 'history.json';
const PRESETS_KEY = 'presets';
const HISTORY_KEY = 'history';

export const sampleDataTemplate = `{
  "接口类型": "入库单",
  "接收系统标识": "JKWMS",
  "接口数据": {}
}`;

export const defaultEndpoint: EndpointNode = {
  id: 'preset_1',
  name: '入库单',
  type: 'endpoint',
  url: DEFAULT_URL,
  appkey: '1',
  password: '1',
  ver: '1',
  dataTemplate: sampleDataTemplate
};

export const defaultPresets: PresetNode[] = [
  {
    id: 'proj_1',
    name: 'WMS仓储系统',
    description: '默认示例项目，可按需修改或删除。',
    type: 'project',
    children: [defaultEndpoint]
  }
];

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function loadTauriStore(fileName: string) {
  const mod = await import('@tauri-apps/plugin-store');
  return mod.Store.load(fileName);
}

function localStorageKey(fileName: string, key: string) {
  return `internal-api-push-tool:${fileName}:${key}`;
}

export async function readStoreValue<T>(fileName: string, key: string, fallback: T): Promise<T> {
  if (typeof window === 'undefined') return fallback;

  if (isTauri()) {
    const store = await loadTauriStore(fileName);
    const value = await store.get<T>(key);
    return value ?? fallback;
  }

  const raw = window.localStorage.getItem(localStorageKey(fileName, key));
  return raw ? (JSON.parse(raw) as T) : fallback;
}

export async function writeStoreValue<T>(fileName: string, key: string, value: T): Promise<void> {
  if (typeof window === 'undefined') return;

  if (isTauri()) {
    const store = await loadTauriStore(fileName);
    await store.set(key, value);
    await store.save();
    return;
  }

  window.localStorage.setItem(localStorageKey(fileName, key), JSON.stringify(value));
}

export function readPresets() {
  return readStoreValue<PresetNode[]>(PRESETS_STORE_FILE, PRESETS_KEY, defaultPresets);
}

export function writePresets(value: PresetNode[]) {
  return writeStoreValue(PRESETS_STORE_FILE, PRESETS_KEY, value);
}

export function readHistory() {
  return readStoreValue<HistoryRecord[]>(HISTORY_STORE_FILE, HISTORY_KEY, []);
}

export function writeHistory(value: HistoryRecord[]) {
  return writeStoreValue(HISTORY_STORE_FILE, HISTORY_KEY, value.slice(0, 300));
}
