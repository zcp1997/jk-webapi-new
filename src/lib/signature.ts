import MD5 from 'crypto-js/md5';
import Utf8 from 'crypto-js/enc-utf8';
import type { GeneratedRequestData, WorkspaceForm } from './types';

export const DEFAULT_URL = 'http://localhost:1725/interface/UpLoadData';

const pad2 = (value: number) => String(value).padStart(2, '0');

export function generateTimestamp(date = new Date()): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds())
  ].join('');
}

export function encodeBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function decodeBase64Utf8(input: string): string {
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createSign(timestamp: string, base64Data: string, password: string): string {
  return MD5(Utf8.parse(`${timestamp}${base64Data}${password}`)).toString().toUpperCase();
}

export function buildRequestData(form: WorkspaceForm, timestamp = generateTimestamp()): GeneratedRequestData {
  const base64Data = encodeBase64Utf8(form.data);
  return {
    appkey: form.appkey,
    timestamp,
    data: base64Data,
    sign: createSign(timestamp, base64Data, form.password),
    ver: form.ver || '1'
  };
}

export function toMultipartFormData(data: GeneratedRequestData): FormData {
  const body = new FormData();
  body.set('appkey', data.appkey);
  body.set('timestamp', data.timestamp);
  body.set('data', data.data);
  body.set('sign', data.sign);
  body.set('ver', data.ver || '1');
  return body;
}

export function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
