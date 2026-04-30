'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { nanoid } from 'nanoid';
import clsx from 'clsx';
import { Clock, Copy, FileJson, Folder, Moon, Plus, Save, Send, Sun, Trash2, ChevronDown, ChevronRight, Activity, X, GripVertical } from 'lucide-react';
import { buildRequestData, DEFAULT_URL, encodeBase64Utf8, prettyJson, toMultipartFormData } from '@/lib/signature';
import { defaultEndpoint, readHistory, readPresets, sampleDataTemplate, writeHistory, writePresets } from '@/lib/store';
import type { EndpointNode, GeneratedRequestData, HistoryRecord, PresetNode, ProjectNode, WorkspaceForm } from '@/lib/types';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type EditableTextProps = {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
};

function EditableText({ value, onSave, className, inputClassName, placeholder }: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  function startEdit() {
    setIsEditing(true);
    setEditValue(value);
  }

  function commitEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setEditValue(value);
    }
    setIsEditing(false);
  }

  function cancelEdit() {
    setEditValue(value);
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        className={clsx(
          'min-w-0 bg-transparent outline-none ring-1 ring-indigo-500 rounded px-1 -mx-1',
          inputClassName
        )}
        placeholder={placeholder}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={className}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      title="双击编辑"
    >
      {value || placeholder}
    </span>
  );
}

type SidebarTab = 'presets' | 'history';
type CreateDialogState =
  | { type: 'project'; title: string; label: string; defaultName: string }
  | { type: 'endpoint'; projectId: string; title: string; label: string; defaultName: string };
type DeleteDialogState =
  | { type: 'project'; projectId: string; title: string; message: string; confirmText: string }
  | { type: 'endpoint'; endpointId: string; title: string; message: string; confirmText: string };

const emptyForm: WorkspaceForm = {
  url: DEFAULT_URL,
  appkey: '',
  password: '',
  ver: '1',
  data: sampleDataTemplate
};

function endpointToForm(endpoint: EndpointNode): WorkspaceForm {
  return {
    url: endpoint.url,
    appkey: endpoint.appkey,
    password: endpoint.password,
    ver: endpoint.ver || '1',
    data: endpoint.dataTemplate
  };
}

function findEndpoint(presets: PresetNode[], endpointId: string): { endpoint: EndpointNode; project: ProjectNode } | null {
  for (const project of presets) {
    if (project.type !== 'project') continue;
    const endpoint = project.children.find((item) => item.id === endpointId);
    if (endpoint) return { endpoint, project };
  }
  return null;
}

function replaceEndpoint(presets: PresetNode[], endpointId: string, form: WorkspaceForm): PresetNode[] {
  return presets.map((project) => {
    if (project.type !== 'project') return project;
    return {
      ...project,
      children: project.children.map((endpoint) =>
        endpoint.id === endpointId
          ? {
              ...endpoint,
              url: form.url,
              appkey: form.appkey,
              password: form.password,
              ver: form.ver,
              dataTemplate: form.data
            }
          : endpoint
      )
    };
  });
}

function isJsonLike(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function normalizeBase64(input: string): string {
  const compact = input.trim().replace(/^data:[^,]+,/, '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = compact.length % 4;
  return padding ? compact.padEnd(compact.length + 4 - padding, '=') : compact;
}

function decodeBase64Utf8(input: string): string | null {
  if (!input.trim()) return '';

  try {
    const binary = atob(normalizeBase64(input));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return isJsonLike(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function getResponseText(body: string): string {
  const decoded = decodeBase64Utf8(body);
  return prettyJson(decoded ?? (body || ''));
}

const REQUEST_TIMEOUT_MS = 10000;

async function tauriAwareFetch(url: string, init: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const fetchFn = isTauriEnv ? tauriFetch : fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

type SortableProjectProps = {
  project: ProjectNode;
  selectedEndpointId: string | null;
  onSelectEndpoint: (endpoint: EndpointNode) => void;
  onAddEndpoint: (projectId: string) => void;
  onRequestDeleteProject: (projectId: string) => void;
  onRequestDeleteEndpoint: (endpointId: string) => void;
  onReorderEndpoints: (projectId: string, activeId: string, overId: string) => void;
  isDraggingEndpoint: string | null;
  onRenameProject: (projectId: string, newName: string) => void;
};

function SortableProject({ project, selectedEndpointId, onSelectEndpoint, onAddEndpoint, onRequestDeleteProject, onRequestDeleteEndpoint, onReorderEndpoints, isDraggingEndpoint, onRenameProject }: SortableProjectProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <section ref={setNodeRef} style={style} className={clsx('rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-[#161f30]', isDragging && 'shadow-lg ring-2 ring-indigo-500/50')}>
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-white/5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button {...attributes} {...listeners} className="cursor-grab p-1 text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:hover:text-slate-300">
            <GripVertical size={14} />
          </button>
          <Folder size={14} className="shrink-0 text-indigo-500 dark:text-indigo-400" />
          <EditableText
            value={project.name}
            onSave={(newName) => onRenameProject(project.id, newName)}
            className="truncate text-[13px] font-semibold text-slate-700 dark:text-slate-200 cursor-text"
            inputClassName="text-[13px] font-semibold text-slate-700 dark:text-slate-200"
          />
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100">
          <button className="rounded p-1.5 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-white/10 dark:hover:text-indigo-400" onClick={() => onAddEndpoint(project.id)} title="添加预设"><Plus size={14} /></button>
          <button className="rounded p-1.5 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400" onClick={() => onRequestDeleteProject(project.id)} title="删除项目"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="p-1.5 space-y-0.5">
        <SortableContext items={project.children.map(e => e.id)} strategy={verticalListSortingStrategy}>
          {project.children.map((endpoint) => (
            <SortableEndpoint
              key={endpoint.id}
              endpoint={endpoint}
              selectedEndpointId={selectedEndpointId}
              onSelectEndpoint={onSelectEndpoint}
              onRequestDeleteEndpoint={onRequestDeleteEndpoint}
              isDragging={isDraggingEndpoint === endpoint.id}
              onRenameEndpoint={onRenameProject}
            />
          ))}
        </SortableContext>
      </div>
    </section>
  );
}

type SortableEndpointProps = {
  endpoint: EndpointNode;
  selectedEndpointId: string | null;
  onSelectEndpoint: (endpoint: EndpointNode) => void;
  onRequestDeleteEndpoint: (endpointId: string) => void;
  isDragging: boolean;
  onRenameEndpoint: (endpointId: string, newName: string) => void;
};

function SortableEndpoint({ endpoint, selectedEndpointId, onSelectEndpoint, onRequestDeleteEndpoint, isDragging, onRenameEndpoint }: SortableEndpointProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isThisDragging } = useSortable({ id: endpoint.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isThisDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'group flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors',
        selectedEndpointId === endpoint.id
          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
          : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200',
        isThisDragging && 'shadow-md ring-1 ring-indigo-500/30'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button {...attributes} {...listeners} className="cursor-grab p-0.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-slate-600 active:cursor-grabbing dark:hover:text-slate-300">
          <GripVertical size={12} />
        </button>
        <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none" onClick={() => onSelectEndpoint(endpoint)}>
          <FileJson size={13} className={clsx("shrink-0", selectedEndpointId === endpoint.id ? "text-indigo-500" : "text-slate-400")} />
          <EditableText
            value={endpoint.name}
            onSave={(newName) => onRenameEndpoint(endpoint.id, newName)}
            className="truncate font-medium cursor-text"
            inputClassName="font-medium text-slate-700 dark:text-slate-200"
          />
        </button>
      </div>
      <button className="shrink-0 p-1 text-slate-400 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100" onClick={() => onRequestDeleteEndpoint(endpoint.id)} title="删除">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState<SidebarTab>('presets');
  const [presets, setPresets] = useState<PresetNode[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkspaceForm>(emptyForm);
  const [generated, setGenerated] = useState<GeneratedRequestData | null>(null);
  const [response, setResponse] = useState('');
  const [responseCode, setResponseCode] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('就绪');
  const [liveRequestPreview, setLiveRequestPreview] = useState<GeneratedRequestData | null>(null);
  const [showBase64Preview, setShowBase64Preview] = useState(false);
  const [truncateDataField, setTruncateDataField] = useState(true);
  const [presetQuery, setPresetQuery] = useState('');
  const [createDialog, setCreateDialog] = useState<CreateDialogState | null>(null);
  const [createName, setCreateName] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeEndpointId, setActiveEndpointId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setMounted(true);
    document.documentElement.classList.toggle('dark', true);
    Promise.all([readPresets(), readHistory()]).then(([presetData, historyData]) => {
      setPresets(presetData);
      setHistory(historyData.sort((a, b) => b.requestTime - a.requestTime));
      const firstProject = presetData.find((item): item is ProjectNode => item.type === 'project');
      const firstEndpoint = firstProject?.children[0];
      if (firstEndpoint) {
        setSelectedEndpointId(firstEndpoint.id);
        setForm(endpointToForm(firstEndpoint));
      }
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle('dark', dark);
  }, [dark, mounted]);

  const selectedMeta = useMemo(() => {
    return selectedEndpointId ? findEndpoint(presets, selectedEndpointId) : null;
  }, [presets, selectedEndpointId]);

  const filteredPresets = useMemo(() => {
    const keyword = presetQuery.trim().toLowerCase();
    if (!keyword) return presets;

    return presets
      .map((project) => {
        if (project.type !== 'project') return project;
        const projectMatched = `${project.name} ${project.description ?? ''}`.toLowerCase().includes(keyword);
        const children = project.children.filter((endpoint) =>
          [endpoint.name, endpoint.url, endpoint.appkey, endpoint.ver, endpoint.dataTemplate]
            .join(' ')
            .toLowerCase()
            .includes(keyword)
        );
        return projectMatched ? project : { ...project, children };
      })
      .filter((project) => project.type !== 'project' || project.children.length > 0 || `${project.name} ${project.description ?? ''}`.toLowerCase().includes(keyword));
  }, [presetQuery, presets]);

  const totalEndpointCount = useMemo(
    () => presets.reduce((count, project) => count + (project.type === 'project' ? project.children.length : 0), 0),
    [presets]
  );

  const base64Preview = useMemo(() => encodeBase64Utf8(form.data), [form.data]);

  const previewData = useMemo(() => {
    const data = generated ?? liveRequestPreview;
    if (!data) return null;

    if (!truncateDataField || data.data.length <= 100) {
      return data;
    }

    return {
      ...data,
      data: data.data.slice(0, 100) + `... (${data.data.length - 100} more chars)`
    };
  }, [generated, liveRequestPreview, truncateDataField]);

  useEffect(() => {
    if (!mounted) return;
    setLiveRequestPreview(buildRequestData(form));
  }, [form, mounted]);

  function updateForm<K extends keyof WorkspaceForm>(key: K, value: WorkspaceForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function persistPresets(next: PresetNode[]) {
    setPresets(next);
    await writePresets(next);
  }

  async function persistHistory(next: HistoryRecord[]) {
    const sorted = next.sort((a, b) => b.requestTime - a.requestTime);
    setHistory(sorted);
    await writeHistory(sorted);
  }

  function addProject() {
    const defaultName = `新项目 ${presets.length + 1}`;
    setCreateDialog({ type: 'project', title: '新建项目', label: '项目名称', defaultName });
    setCreateName(defaultName);
  }

  function addEndpoint(projectId: string) {
    const defaultName = `新接口预设 ${totalEndpointCount + 1}`;
    setCreateDialog({ type: 'endpoint', projectId, title: '新增接口预设', label: '预设接口名称', defaultName });
    setCreateName(defaultName);
  }

  async function confirmCreate() {
    if (!createDialog) return;
    const name = createName.trim();
    if (!name) {
      setStatus('名称不能为空');
      return;
    }

    if (createDialog.type === 'project') {
      const endpoint: EndpointNode = {
        ...defaultEndpoint,
        id: `preset_${nanoid(8)}`,
        name: '默认接口预设',
        url: form.url || defaultEndpoint.url,
        appkey: form.appkey || defaultEndpoint.appkey,
        password: form.password || defaultEndpoint.password,
        ver: form.ver || defaultEndpoint.ver,
        dataTemplate: form.data || defaultEndpoint.dataTemplate
      };
      const project: ProjectNode = {
        id: `proj_${nanoid(8)}`,
        name,
        description: '',
        type: 'project',
        children: [endpoint]
      };

      await persistPresets([...presets, project]);
      setPresetQuery('');
      setSelectedEndpointId(endpoint.id);
      setForm(endpointToForm(endpoint));
      setTab('presets');
      setStatus(`已新建项目「${name}」并创建默认接口预设`);
      setCreateDialog(null);
      return;
    }

    const endpoint: EndpointNode = {
      ...defaultEndpoint,
      id: `preset_${nanoid(8)}`,
      name,
      url: form.url || defaultEndpoint.url,
      appkey: form.appkey || defaultEndpoint.appkey,
      password: form.password || defaultEndpoint.password,
      ver: form.ver || defaultEndpoint.ver,
      dataTemplate: form.data || defaultEndpoint.dataTemplate
    };
    const next = presets.map((project) =>
      project.type === 'project' && project.id === createDialog.projectId
        ? { ...project, children: [...project.children, endpoint] }
        : project
    );
    await persistPresets(next);
    setPresetQuery('');
    setSelectedEndpointId(endpoint.id);
    setForm(endpointToForm(endpoint));
    setTab('presets');
    setStatus(`已新增接口预设「${name}」`);
    setCreateDialog(null);
  }

  function requestDeleteProject(projectId: string) {
    const project = presets.find((item): item is ProjectNode => item.type === 'project' && item.id === projectId);
    if (!project) return;
    if (presets.filter((item) => item.type === 'project').length <= 1) {
      setStatus('删除失败：必须至少保留一个项目');
      return;
    }
    if (totalEndpointCount - project.children.length < 1) {
      setStatus('删除失败：必须至少保留一个预设接口参数');
      return;
    }
    setDeleteDialog({
      type: 'project',
      projectId,
      title: '确认删除项目',
      message: `将删除项目「${project.name}」及其下 ${project.children.length} 个预设接口，此操作不可撤销。`,
      confirmText: '确认删除项目'
    });
  }

  function requestDeleteEndpoint(endpointId: string) {
    if (totalEndpointCount <= 1) {
      setStatus('删除失败：必须至少保留一个预设接口参数');
      return;
    }
    const meta = findEndpoint(presets, endpointId);
    if (!meta) return;
    setDeleteDialog({
      type: 'endpoint',
      endpointId,
      title: '确认删除预设接口',
      message: `将删除「${meta.project.name} / ${meta.endpoint.name}」，此操作不可撤销。`,
      confirmText: '确认删除接口'
    });
  }

  async function confirmDelete() {
    if (!deleteDialog) return;

    if (deleteDialog.type === 'project') {
      const project = presets.find((item): item is ProjectNode => item.type === 'project' && item.id === deleteDialog.projectId);
      if (!project) {
        setDeleteDialog(null);
        return;
      }
      if (presets.filter((item) => item.type === 'project').length <= 1) {
        setStatus('删除失败：必须至少保留一个项目');
        setDeleteDialog(null);
        return;
      }
      if (totalEndpointCount - project.children.length < 1) {
        setStatus('删除失败：必须至少保留一个预设接口参数');
        setDeleteDialog(null);
        return;
      }

      const next = presets.filter((item) => item.id !== deleteDialog.projectId);
      await persistPresets(next);

      if (selectedEndpointId && project.children.some((endpoint) => endpoint.id === selectedEndpointId)) {
        const firstProject = next.find((item): item is ProjectNode => item.type === 'project' && item.children.length > 0);
        const firstEndpoint = firstProject?.children[0];
        setSelectedEndpointId(firstEndpoint?.id ?? null);
        if (firstEndpoint) setForm(endpointToForm(firstEndpoint));
      }
      setStatus(`已删除项目「${project.name}」`);
      setDeleteDialog(null);
      return;
    }

    if (totalEndpointCount <= 1) {
      setStatus('删除失败：必须至少保留一个预设接口参数');
      setDeleteDialog(null);
      return;
    }
    const meta = findEndpoint(presets, deleteDialog.endpointId);
    const next = presets.map((project) =>
      project.type === 'project'
        ? { ...project, children: project.children.filter((endpoint) => endpoint.id !== deleteDialog.endpointId) }
        : project
    );
    await persistPresets(next);
    if (selectedEndpointId === deleteDialog.endpointId) {
      const firstProject = next.find((item): item is ProjectNode => item.type === 'project' && item.children.length > 0);
      const firstEndpoint = firstProject?.children[0];
      setSelectedEndpointId(firstEndpoint?.id ?? null);
      if (firstEndpoint) setForm(endpointToForm(firstEndpoint));
    }
    setStatus(meta ? `已删除预设接口「${meta.endpoint.name}」` : '预设接口已删除');
    setDeleteDialog(null);
  }

  async function saveCurrentPreset() {
    if (!selectedEndpointId) {
      setStatus('未选择预设，当前参数仅作为临时请求使用');
      return;
    }
    const next = replaceEndpoint(presets, selectedEndpointId, form);
    await persistPresets(next);
    setStatus('预设已保存');
  }

  async function copyGenerated() {
    const data = generated ?? buildRequestData(form);
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setStatus('最终请求参数已复制');
  }

  async function copyResponse() {
    if (!response) {
      setStatus('暂无响应结果可复制');
      return;
    }
    await navigator.clipboard.writeText(response);
    setStatus('响应结果 JSON 已复制');
  }

  async function formatPayload() {
    updateForm('data', prettyJson(form.data));
  }

  async function sendRequest() {
    setSending(true);
    const requestData = buildRequestData(form);
    setGenerated(requestData);
    setResponse('');
    setResponseCode(null);
    setStatus('发送中...');

    let code: number | null = null;
    let body = '';
    try {
      const res = await tauriAwareFetch(form.url, {
        method: 'POST',
        body: toMultipartFormData(requestData)
      });
      code = res.status;
      body = await res.text();
      setResponseCode(code);
      setResponse(getResponseText(body));
      setStatus(code >= 200 && code < 300 ? '发送完成' : `请求返回 HTTP ${code}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.name === 'AbortError') {
        code = null;
        body = `请求超时：后端接口在 ${REQUEST_TIMEOUT_MS / 1000} 秒内未响应，请检查网络连接或联系后端确认接口状态`;
        setResponseCode(null);
        setResponse(body);
        setStatus('请求超时');
      } else if (/error sending request|fetch failed|networkerror|ECONNREFUSED|ENOTFOUND|Failed to fetch|NetworkError/i.test(msg)) {
        body = `连接失败：无法连接到 ${form.url}\n\n可能原因：\n1. 后端服务未启动或已崩溃\n2. 请求地址或端口号错误\n3. 网络不通或被防火墙拦截\n\n原始错误：${msg}`;
        setResponseCode(null);
        setResponse(body);
        setStatus('连接失败');
      } else {
        body = `请求异常：${msg}`;
        setResponse(body);
        setStatus('发送失败');
      }
    } finally {
      const presetName = selectedMeta ? `${selectedMeta.project.name} - ${selectedMeta.endpoint.name}` : '未关联预设';
      const record: HistoryRecord = {
        id: `hist_${nanoid(10)}`,
        requestTime: Date.now(),
        presetName,
        url: form.url,
        requestData,
        responseCode: code,
        responseBody: body
      };
      await persistHistory([record, ...history]);
      setSending(false);
    }
  }

  function loadHistory(record: HistoryRecord) {
    setForm((prev) => ({
      ...prev,
      url: record.url,
      appkey: record.requestData.appkey,
      ver: record.requestData.ver
    }));
    setGenerated(record.requestData);
    setResponseCode(record.responseCode);
    setResponse(getResponseText(record.responseBody));
    setStatus('已回显历史记录；如需一键重发，请确认 Password 与明文 Payload 后点击发送');
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = event.active.id as string;
    const found = findEndpoint(presets, activeId);
    if (found) {
      setActiveEndpointId(activeId);
    } else {
      setActiveProjectId(activeId);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveProjectId(null);
    setActiveEndpointId(null);

    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const isEndpoint = presets.some(p => p.type === 'project' && p.children.some(e => e.id === activeId));

    if (isEndpoint) {
      const projectWithActive = presets.find(p => p.type === 'project' && p.children.some(e => e.id === activeId));
      const projectWithOver = presets.find(p => p.type === 'project' && p.children.some(e => e.id === overId));

      if (projectWithActive && projectWithOver && projectWithActive.id === projectWithOver.id) {
        const next = presets.map(p => {
          if (p.type !== 'project' || p.id !== projectWithActive.id) return p;
          const oldIndex = p.children.findIndex(e => e.id === activeId);
          const newIndex = p.children.findIndex(e => e.id === overId);
          return { ...p, children: arrayMove(p.children, oldIndex, newIndex) };
        });
        persistPresets(next);
      }
    } else {
      const oldIndex = presets.findIndex(p => p.id === activeId);
      const newIndex = presets.findIndex(p => p.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        persistPresets(arrayMove(presets, oldIndex, newIndex));
      }
    }
  }

  function handleRename(id: string, newName: string) {
    const next = presets.map((project) => {
      if (project.id === id && project.type === 'project') {
        return { ...project, name: newName };
      }
      if (project.type === 'project') {
        return {
          ...project,
          children: project.children.map((endpoint) =>
            endpoint.id === id ? { ...endpoint, name: newName } : endpoint
          )
        };
      }
      return project;
    });
    persistPresets(next);
    setStatus(`已重命名为「${newName}」`);
  }

  return (
    <main className="relative flex h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0b0f18] dark:text-slate-200 selection:bg-indigo-500/30">
      
      {/* Sidebar */}
      <aside className="flex w-72 lg:w-80 shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-white/5 dark:bg-[#111827] z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-none">
        
        <div className="flex items-center justify-between border-b border-slate-200/80 p-5 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
              <Activity size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-100">JKWEB API</h1>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Made By ZCP</p>
            </div>
          </div>
          <button
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
            onClick={() => setDark((value) => !value)}
            title="切换主题"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="p-4 pb-2">
          <div className="flex rounded-lg bg-slate-100/80 p-1 dark:bg-black/40 border border-slate-200/50 dark:border-white/5">
            <button 
              className={clsx('flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200', tab === 'presets' ? 'bg-white text-slate-900 shadow-sm dark:bg-[#1f2937] dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')} 
              onClick={() => setTab('presets')}
            >
              预设配置
            </button>
            <button 
              className={clsx('flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200', tab === 'history' ? 'bg-white text-slate-900 shadow-sm dark:bg-[#1f2937] dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')} 
              onClick={() => setTab('history')}
            >
              历史记录
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4 custom-scrollbar">
          {tab === 'presets' ? (
            <div className="space-y-4">
              <div className="relative flex items-center">
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-[13px] text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-200 dark:focus:border-indigo-500/50" 
                  value={presetQuery} 
                  onChange={(event) => setPresetQuery(event.target.value)} 
                  placeholder="过滤项目 / 接口 / URL..." 
                />
                
                {presetQuery && (
                  <button
                    className="absolute right-2.5 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-300"
                    onClick={() => setPresetQuery('')}
                    title="清空搜索"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              
              <button 
                className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 py-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/10 dark:bg-transparent dark:text-slate-400 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400" 
                onClick={addProject}
              >
                <Plus size={14} className="transition-transform group-hover:scale-110" /> 新建项目
              </button>
              
              {filteredPresets.length === 0 && <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-500">空空如也</p>}
              
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={filteredPresets.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {filteredPresets.map((project) => project.type === 'project' && (
                      <SortableProject
                        key={project.id}
                        project={project}
                        selectedEndpointId={selectedEndpointId}
                        onSelectEndpoint={(endpoint) => { setSelectedEndpointId(endpoint.id); setForm(endpointToForm(endpoint)); setGenerated(null); }}
                        onAddEndpoint={addEndpoint}
                        onRequestDeleteProject={requestDeleteProject}
                        onRequestDeleteEndpoint={requestDeleteEndpoint}
                        onReorderEndpoints={() => {}}
                        isDraggingEndpoint={activeEndpointId}
                        onRenameProject={handleRename}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeProjectId ? (
                    <div className="rounded-xl border border-indigo-500 bg-white px-3 py-2.5 shadow-xl dark:bg-[#161f30]">
                      <div className="flex items-center gap-2.5">
                        <GripVertical size={14} className="text-slate-400" />
                        <Folder size={14} className="text-indigo-500 dark:text-indigo-400" />
                        <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                          {presets.find(p => p.id === activeProjectId)?.name}
                        </span>
                      </div>
                    </div>
                  ) : activeEndpointId ? (
                    <div className="rounded-lg bg-indigo-50 px-2.5 py-2 shadow-xl dark:bg-indigo-500/15">
                      <div className="flex items-center gap-2.5">
                        <GripVertical size={12} className="text-slate-400" />
                        <FileJson size={13} className="text-indigo-500" />
                        <span className="text-[13px] font-medium text-indigo-700 dark:text-indigo-300">
                          {(() => {
                            const found = findEndpoint(presets, activeEndpointId);
                            return found?.endpoint.name;
                          })()}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          ) : (
            <div className="space-y-2.5">
              {history.length === 0 && <p className="py-8 text-center text-xs text-slate-500">暂无历史记录</p>}
              {history.map((record) => (
                <button 
                  key={record.id} 
                  className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-white/5 dark:bg-[#161f30] dark:hover:border-indigo-500/50" 
                  onClick={() => loadHistory(record)}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-200">{record.presetName}</span>
                    <span className={clsx(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider", 
                      record.responseCode && record.responseCode < 300 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                    )}>
                      {record.responseCode ?? 'ERR'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <Clock size={12} /> {new Date(record.requestTime).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-[#0b0f18]">
        
        {/* Top Request Bar */}
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-6 py-4 shadow-sm dark:border-white/5 dark:bg-[#111827]">
          <div className="flex h-10 items-center rounded-xl bg-slate-100 px-3 text-[13px] font-bold text-indigo-600 dark:bg-black/40 dark:text-indigo-400 border border-transparent dark:border-white/5">
            POST
          </div>
          <div className="relative min-w-0 flex-1">
            <input 
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-4 pr-4 font-mono text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-[#0b0f18] dark:text-slate-200" 
              value={form.url} 
              onChange={(event) => updateForm('url', event.target.value)} 
              placeholder="https://api.example.com/endpoint" 
            />
          </div>
          <button 
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-[13px] font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-600/30 active:scale-95 disabled:pointer-events-none disabled:opacity-50" 
            onClick={sendRequest} 
            disabled={sending || !form.url || !form.appkey}
          >
            <Send size={15} className={clsx(sending && "animate-pulse")} /> 
            {sending ? 'Sending...' : 'Send'}
          </button>
        </header>

        {/* Workspace Grid */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden p-6 custom-scrollbar">
          
          {/* Left Column: Request Params */}
          <section className="flex min-h-0 flex-col gap-6">
            
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-[#111827]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-white/5">
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Base Parameters</h2>
                <button 
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-indigo-600 dark:border-white/10 dark:bg-black/20 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-indigo-400" 
                  onClick={saveCurrentPreset}
                >
                  <Save size={13} /> 保存
                </button>
              </div>
              <div className="grid grid-cols-2 gap-5 p-5">
                <label className="space-y-1.5">
                  <span className="block text-[12px] font-semibold text-slate-500 dark:text-slate-400">AppKey</span>
                  <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-black/20 dark:focus:border-indigo-500/80 dark:focus:bg-[#0b0f18]" value={form.appkey} onChange={(event) => updateForm('appkey', event.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="block text-[12px] font-semibold text-slate-500 dark:text-slate-400">Password</span>
                  <input type="password" placeholder="••••••••" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-black/20 dark:focus:border-indigo-500/80 dark:focus:bg-[#0b0f18]" value={form.password} onChange={(event) => updateForm('password', event.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="block text-[12px] font-semibold text-slate-500 dark:text-slate-400">Version</span>
                  <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-black/20 dark:focus:border-indigo-500/80 dark:focus:bg-[#0b0f18]" value={form.ver} onChange={(event) => updateForm('ver', event.target.value)} />
                </label>
                <div className="space-y-1.5">
                  <span className="block text-[12px] font-semibold text-slate-500 dark:text-slate-400">当前关联</span>
                  <div className="flex h-[42px] items-center truncate rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-3 text-[13px] font-medium text-slate-700 dark:border-white/10 dark:bg-black/10 dark:text-slate-300">
                    {selectedMeta ? `${selectedMeta.project.name} / ${selectedMeta.endpoint.name}` : '临时请求'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-[#111827]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-white/5">
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Payload JSON</h2>
                <button className="text-[12px] font-semibold text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300" onClick={formatPayload}>格式化 (Prettier)</button>
              </div>
              <textarea 
                className="min-h-0 flex-1 resize-none bg-slate-50/50 p-5 font-mono text-[13px] leading-relaxed text-slate-800 outline-none transition-colors focus:bg-white dark:bg-[#0b0f18]/50 dark:text-slate-300 dark:focus:bg-[#0b0f18] rounded-b-2xl" 
                value={form.data} 
                onChange={(event) => updateForm('data', event.target.value)} 
                spellCheck={false} 
              />
            </div>

          </section>

          {/* Right Column: Previews & Response */}
          <section className="flex min-h-0 flex-col gap-6">
            
            <div className="rounded-2xl border border-slate-200/80 bg-slate-900 shadow-sm dark:border-white/5 dark:bg-[#111827] flex flex-col">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-100">最终请求预览</h2>
                <button 
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white" 
                  onClick={copyGenerated}
                >
                  <Copy size={13} /> Copy
                </button>
              </div>
              <pre className="max-h-48 overflow-auto p-5 font-mono text-[12px] leading-relaxed text-emerald-400 custom-scrollbar">
                {JSON.stringify(previewData ?? { appkey: form.appkey, timestamp: '...', data: base64Preview, sign: '...', ver: form.ver || '1' }, null, 2)}
              </pre>
              <div className="border-t border-white/5 bg-black/20 px-5 py-3 text-[11px] font-medium leading-relaxed text-slate-400 rounded-b-2xl flex items-start justify-between gap-3">
                <div>
                  规则: <span className="text-slate-300">MD5(timestamp + Base64(data) + password)</span><br/>
                  格式: <span className="text-slate-300">multipart/form-data</span>
                </div>
                <button
                  className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                  onClick={() => setTruncateDataField((v) => !v)}
                  title={truncateDataField ? '展开完整 data 字段' : '收起 data 字段'}
                >
                  data: {truncateDataField ? '截断' : '完整'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-[#111827]">
              <button 
                className="flex w-full items-center justify-between px-5 py-4 text-left outline-none" 
                onClick={() => setShowBase64Preview((value) => !value)}
              >
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Base64 Data 预览</h2>
                {showBase64Preview ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
              </button>
              {showBase64Preview && (
                <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-white/5">
                  <textarea 
                    className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-600 outline-none dark:border-white/10 dark:bg-[#0b0f18] dark:text-slate-400" 
                    value={base64Preview} 
                    readOnly 
                  />
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200/80 bg-slate-900 shadow-sm dark:border-white/5 dark:bg-[#111827]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-100">响应结果</h2>
                  {responseCode && (
                    <span className={clsx('rounded px-2 py-0.5 text-[11px] font-bold tracking-wider', responseCode < 300 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                      HTTP {responseCode}
                    </span>
                  )}
                </div>
                <button 
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30" 
                  onClick={copyResponse} 
                  disabled={!response} 
                  title="复制 JSON"
                >
                  <Copy size={13} /> Copy
                </button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto p-5 font-mono text-[13px] leading-relaxed text-slate-300 custom-scrollbar rounded-b-2xl">
                {response || <span className="text-slate-600">等待发送请求...</span>}
              </pre>
            </div>

          </section>
        </div>

        {/* Status Footer */}
        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200/80 bg-white px-6 py-2.5 text-[12px] font-medium text-slate-500 dark:border-white/5 dark:bg-[#111827] dark:text-slate-400 z-10 shadow-[0_-4px_24px_rgba(0,0,0,0.02)] dark:shadow-none">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {sending && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>}
              <span className={clsx("relative inline-flex h-2 w-2 rounded-full", sending ? "bg-indigo-500" : (responseCode && responseCode < 300 ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-600"))}></span>
            </span>
            {status}
          </div>
          <span>Content-Type: multipart/form-data</span>
        </footer>
      </section>

      {/* Dialogs */}
      {deleteDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm transition-all dark:bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#161f30] animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{deleteDialog.title}</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">{deleteDialog.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-xl px-4 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" onClick={() => setDeleteDialog(null)}>取消</button>
              <button className="rounded-xl bg-red-600 px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-red-600/20 transition-all hover:bg-red-500 active:scale-95" onClick={() => void confirmDelete()}>{deleteDialog.confirmText}</button>
            </div>
          </div>
        </div>
      )}

      {createDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm transition-all dark:bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#161f30] animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{createDialog.title}</h2>
            <label className="mt-5 block space-y-2 text-sm">
              <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-400">{createDialog.label}</span>
              <input
                autoFocus
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[14px] outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-indigo-500/80 dark:focus:bg-[#0b0f18]"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void confirmCreate();
                  if (event.key === 'Escape') setCreateDialog(null);
                }}
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-xl px-4 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" onClick={() => setCreateDialog(null)}>取消</button>
              <button className="rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500 active:scale-95" onClick={() => void confirmCreate()}>确认创建</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}