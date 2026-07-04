import Taro from '@tarojs/taro';
import type { EvaluatedTicket, RuleConfig } from '../domain/dlt';
import type { AuthSession } from './auth';

const API_BASE = process.env.TARO_APP_API_BASE || '';

export type UserState = {
  config: RuleConfig | null;
  cart: EvaluatedTicket[];
  updatedAt?: string | null;
};

export async function fetchUserState(auth: AuthSession): Promise<UserState> {
  const response = await Taro.request<UserState>({
    url: `${getApiBase()}/api/me/state`,
    method: 'GET',
    header: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  if (response.statusCode === 401) {
    throw new Error('登录已失效，请重新登录');
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`读取云端数据失败：HTTP ${response.statusCode}`);
  }

  return response.data;
}

export async function saveUserState(auth: AuthSession, state: Pick<UserState, 'cart' | 'config'>) {
  const response = await Taro.request<{ ok: boolean; updatedAt?: string }>({
    url: `${getApiBase()}/api/me/state`,
    method: 'PUT',
    header: {
      Authorization: `Bearer ${auth.token}`,
    },
    data: state,
  });

  if (response.statusCode === 401) {
    throw new Error('登录已失效，请重新登录');
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`保存云端数据失败：HTTP ${response.statusCode}`);
  }

  return response.data;
}

function getApiBase() {
  if (!API_BASE) {
    throw new Error('需要先配置 TARO_APP_API_BASE');
  }

  return API_BASE.replace(/\/$/, '');
}
