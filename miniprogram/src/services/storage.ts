import Taro from '@tarojs/taro';
import type { DltDraw, EvaluatedTicket, RuleConfig } from '../domain/dlt';
import type { AuthSession } from './auth';

const AUTH_KEY = 'lotto-sieve:auth-session';
const CONFIG_KEY = 'lotto-sieve:rule-config';
const CART_KEY = 'lotto-sieve:cart';
const HISTORY_KEY = 'lotto-sieve:history';

export function loadStoredAuth(): AuthSession | undefined {
  return safeGet<AuthSession>(AUTH_KEY);
}

export function saveStoredAuth(session: AuthSession) {
  Taro.setStorageSync(AUTH_KEY, session);
}

export function clearStoredAuth() {
  Taro.removeStorageSync(AUTH_KEY);
}

export function loadStoredConfig(): RuleConfig | undefined {
  return safeGet<RuleConfig>(CONFIG_KEY);
}

export function saveStoredConfig(config: RuleConfig) {
  Taro.setStorageSync(CONFIG_KEY, config);
}

export function loadStoredCart(): EvaluatedTicket[] {
  return safeGet<EvaluatedTicket[]>(CART_KEY) ?? [];
}

export function saveStoredCart(cart: EvaluatedTicket[]) {
  Taro.setStorageSync(CART_KEY, cart);
}

export function loadStoredHistory(): DltDraw[] | undefined {
  return safeGet<DltDraw[]>(HISTORY_KEY);
}

export function saveStoredHistory(draws: DltDraw[]) {
  Taro.setStorageSync(HISTORY_KEY, draws);
}

function safeGet<T>(key: string): T | undefined {
  try {
    return Taro.getStorageSync<T>(key);
  } catch {
    return undefined;
  }
}
