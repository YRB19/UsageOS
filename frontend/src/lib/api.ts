import axios from 'axios';
import type { AccountWithUsage, Account, SyncEvent, NoteResponse } from './types';

const baseURL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

export async function getAccounts(): Promise<AccountWithUsage[]> {
  const { data } = await api.get('/v1/accounts');
  return data || [];
}

export async function patchAccount(
  accountId: string,
  patch: { nickname?: string | null; color?: string; telegram_chat_id?: string | null }
): Promise<AccountWithUsage> {
  const { data } = await api.patch(`/v1/accounts/${accountId}`, patch);
  return data;
}

export async function getNote(accountId: string): Promise<NoteResponse> {
  const { data } = await api.get(`/v1/accounts/${accountId}/note`);
  return data;
}

export async function putNote(accountId: string, content: string): Promise<NoteResponse> {
  const { data } = await api.put(`/v1/accounts/${accountId}/note`, { content });
  return data;
}

export async function getSyncHistory(accountId: string, limit = 50): Promise<SyncEvent[]> {
  const { data } = await api.get(`/v1/accounts/${accountId}/sync-history`, {
    params: { limit },
  });
  return data || [];
}

export async function uploadAvatar(accountId: string, file: File): Promise<Account> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(`/v1/accounts/${accountId}/avatar`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}