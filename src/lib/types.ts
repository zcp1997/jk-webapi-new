export type PresetNode = ProjectNode | EndpointNode;

export interface ProjectNode {
  id: string;
  name: string;
  description?: string;
  type: 'project';
  children: EndpointNode[];
}

export interface EndpointNode {
  id: string;
  name: string;
  type: 'endpoint';
  url: string;
  appkey: string;
  password: string;
  ver: string;
  dataTemplate: string;
}

export interface WorkspaceForm {
  url: string;
  appkey: string;
  password: string;
  ver: string;
  data: string;
}

export interface GeneratedRequestData {
  appkey: string;
  timestamp: string;
  data: string;
  sign: string;
  ver: string;
}

export interface HistoryRecord {
  id: string;
  requestTime: number;
  presetName: string;
  url: string;
  requestData: GeneratedRequestData;
  responseCode: number | null;
  responseBody: string;
}
