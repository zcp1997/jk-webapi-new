'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { nanoid } from 'nanoid';
import clsx from 'clsx';
import { Clock, Copy, FileJson, Folder, History, Moon, Plus, Save, Send, Sun, Trash2 } from 'lucide-react';
import { buildRequestData, DEFAULT_URL, encodeBase64Utf8, prettyJson, toMultipartFormData } from '@/lib/signature';
import { defaultEndpoint, readHistory, readPresets, sampleDataTemplate, writeHistory, writePresets } from '@/lib/store';
import type { EndpointNode, GeneratedRequestData, HistoryRecord, PresetNode, ProjectNode, WorkspaceForm } from '@/lib/types';

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

function getResponseText(body: string): string {
  return prettyJson(body || '');
}

async function tauriAwareFetch(url: string, init: RequestInit): Promise<Response> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return tauriFetch(url, init);
  }
  return fetch(url, init);
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);
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
  const [presetQuery, setPresetQuery] = useState('');
  const [createDialog, setCreateDialog] = useState<CreateDialogState | null>(null);
  const [createName, setCreateName] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);

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
      body = error instanceof Error ? error.message : String(error);
      setResponse(body);
      setStatus('发送失败');
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

  return (
    <main className="relative flex h-screen overflow-hidden bg-slate-100 text-slate-950 dark:bg-panel-darker dark:text-slate-100">
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-panel-dark">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <div>
            <h1 className="text-base font-semibold">内部 API 推送工具</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Tauri + Next.js</p>
          </div>
          <button
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            onClick={() => setDark((value) => !value)}
            title="切换主题"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3">
          <button className={clsx('rounded-lg px-3 py-2 text-sm', tab === 'presets' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800')} onClick={() => setTab('presets')}>预设配置</button>
          <button className={clsx('rounded-lg px-3 py-2 text-sm', tab === 'history' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800')} onClick={() => setTab('history')}>历史记录</button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 pb-4">
          {tab === 'presets' ? (
            <div className="space-y-3">
              <input className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700" value={presetQuery} onChange={(event) => setPresetQuery(event.target.value)} placeholder="过滤项目 / 接口 / URL / AppKey" />
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={addProject}>
                <Plus size={15} /> 新建项目
              </button>
              {filteredPresets.length === 0 && <p className="rounded-lg border border-slate-200 p-4 text-center text-sm text-slate-500 dark:border-slate-800">无匹配的项目或接口</p>}
              {filteredPresets.map((project) => project.type === 'project' && (
                <section key={project.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 font-medium"><Folder size={16} className="shrink-0 text-amber-500" /><span className="truncate">{project.name}</span></div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => addEndpoint(project.id)} title="添加预设"><Plus size={15} /></button>
                      <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800" onClick={() => requestDeleteProject(project.id)} title="删除项目"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 pl-2">
                    {project.children.map((endpoint) => (
                      <div key={endpoint.id} className={clsx('group flex items-center justify-between rounded-lg px-2 py-2 text-sm', selectedEndpointId === endpoint.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>
                        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setSelectedEndpointId(endpoint.id); setForm(endpointToForm(endpoint)); }}>
                          <FileJson size={15} className="shrink-0" /><span className="truncate">{endpoint.name}</span>
                        </button>
                        <button className="opacity-70 hover:opacity-100" onClick={() => requestDeleteEndpoint(endpoint.id)} title="删除"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {history.length === 0 && <p className="p-4 text-center text-sm text-slate-500">暂无历史记录</p>}
              {history.map((record) => (
                <button key={record.id} className="w-full rounded-xl border border-slate-200 p-3 text-left text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800" onClick={() => loadHistory(record)}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{record.presetName}</span><span className="text-xs text-slate-500">{record.responseCode ?? 'ERR'}</span></div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock size={13} /> {new Date(record.requestTime).toLocaleString()}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex gap-3 border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-panel-dark">
          <input className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" value={form.url} onChange={(event) => updateForm('url', event.target.value)} placeholder="目标 URL" />
          <button className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60" onClick={sendRequest} disabled={sending || !form.url || !form.appkey}>
            <Send size={17} /> {sending ? '发送中' : '发送'}
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-hidden p-4">
          <section className="flex min-h-0 flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-panel-dark">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">基础参数</h2>
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={saveCurrentPreset}><Save size={15} />保存预设</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm"><span className="text-slate-500">AppKey *</span><input className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-700" value={form.appkey} onChange={(event) => updateForm('appkey', event.target.value)} /></label>
                <label className="space-y-1 text-sm"><span className="text-slate-500">Password（本地签名）</span><input className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-700" value={form.password} onChange={(event) => updateForm('password', event.target.value)} /></label>
                <label className="space-y-1 text-sm"><span className="text-slate-500">Version</span><input className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-700" value={form.ver} onChange={(event) => updateForm('ver', event.target.value)} /></label>
                <div className="space-y-1 text-sm"><span className="text-slate-500">当前预设</span><div className="truncate rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">{selectedMeta ? `${selectedMeta.project.name} / ${selectedMeta.endpoint.name}` : '临时请求'}</div></div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-panel-dark">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Payload 明文 JSON</h2><button className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={formatPayload}>格式化</button></div>
              <textarea className="min-h-0 flex-1 resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" value={form.data} onChange={(event) => updateForm('data', event.target.value)} spellCheck={false} />
            </div>
          </section>

          <section className="flex min-h-0 flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-panel-dark">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">最终请求参数预览</h2><button className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={copyGenerated}><Copy size={15} />复制</button></div>
              <pre className="max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-green-200">{JSON.stringify(generated ?? liveRequestPreview ?? { appkey: form.appkey, timestamp: '客户端生成中...', data: base64Preview, sign: '客户端生成中...', ver: form.ver || '1' }, null, 2)}</pre>
              <div className="mt-3 text-xs text-slate-500">签名规则：MD5(timestamp + Base64(data) + password)，timestamp 为 yyyyMMddHHmmss 14 位本地时间。发送格式：multipart/form-data。</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-panel-dark">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setShowBase64Preview((value) => !value)}>
                <h2 className="font-semibold">Base64 Data 预览</h2>
                <span className="text-xs text-slate-500">{showBase64Preview ? '收起' : '展开'}</span>
              </button>
              {showBase64Preview && <textarea className="mt-3 h-28 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs outline-none dark:border-slate-700 dark:bg-slate-950" value={base64Preview} readOnly />}
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-panel-dark">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">响应结果</h2><span className={clsx('rounded-full px-2 py-1 text-xs', responseCode && responseCode < 300 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>{responseCode ?? '未发送'}</span></div>
              <pre className="min-h-0 flex-1 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{response || '等待发送请求...'}</pre>
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-panel-dark">
          <span>{status}</span>
          <span>Content-Type: multipart/form-data</span>
        </footer>
      </section>

      {deleteDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-panel-dark">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">{deleteDialog.title}</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{deleteDialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => setDeleteDialog(null)}>取消</button>
              <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500" onClick={() => void confirmDelete()}>{deleteDialog.confirmText}</button>
            </div>
          </div>
        </div>
      )}

      {createDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-panel-dark">
            <h2 className="text-lg font-semibold">{createDialog.title}</h2>
            <label className="mt-4 block space-y-2 text-sm">
              <span className="text-slate-500">{createDialog.label}</span>
              <input
                autoFocus
                className="w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-700"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void confirmCreate();
                  if (event.key === 'Escape') setCreateDialog(null);
                }}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => setCreateDialog(null)}>取消</button>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500" onClick={() => void confirmCreate()}>确认创建</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
