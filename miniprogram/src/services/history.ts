import Taro from '@tarojs/taro';
import { DltDraw, toBackNumbers, toFrontNumbers } from '../domain/dlt';

const API_BASE = process.env.TARO_APP_API_BASE || '';

type ApiHistoryResponse = {
  draws: DltDraw[];
};

type SportteryHistoryResponse = {
  success: boolean;
  errorMessage?: string;
  value?: {
    list: SportteryDrawRecord[];
  };
};

type SportteryDrawRecord = {
  lotteryDrawNum: string;
  lotteryDrawResult: string;
  lotteryDrawTime: string;
  poolBalanceAfterdraw?: string;
  totalSaleAmount?: string;
};

export async function fetchHistoryFromProxy(): Promise<DltDraw[]> {
  if (!API_BASE) {
    throw new Error('需要先配置 TARO_APP_API_BASE，指向你的 HTTPS 后端代理');
  }

  const response = await Taro.request<ApiHistoryResponse | SportteryHistoryResponse>({
    url: `${API_BASE.replace(/\/$/, '')}/api/dlt/history`,
    method: 'GET',
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`历史数据接口异常：HTTP ${response.statusCode}`);
  }

  const payload = response.data;

  if ('draws' in payload) {
    return payload.draws;
  }

  if (!payload.success || !payload.value) {
    throw new Error(payload.errorMessage || '历史数据接口返回异常');
  }

  return normalizeSportteryRecords(payload.value.list);
}

function normalizeSportteryRecords(records: SportteryDrawRecord[]) {
  const byIssue = new Map<string, DltDraw>();

  records.forEach((record) => {
    const draw = parseSportteryDraw(record);
    if (draw) byIssue.set(draw.issue, draw);
  });

  return [...byIssue.values()].sort((left, right) => {
    const dateSort = right.date.localeCompare(left.date);
    return dateSort === 0 ? right.issue.localeCompare(left.issue) : dateSort;
  });
}

function parseSportteryDraw(record: SportteryDrawRecord): DltDraw | null {
  const numbers = record.lotteryDrawResult
    .trim()
    .split(/\s+/)
    .map((value) => Number(value));

  if (numbers.length !== 7 || numbers.some((value) => !Number.isInteger(value) || value < 1)) {
    return null;
  }

  return {
    issue: record.lotteryDrawNum,
    date: record.lotteryDrawTime,
    front: toFrontNumbers(numbers.slice(0, 5)),
    back: toBackNumbers(numbers.slice(5, 7)),
    saleAmount: record.totalSaleAmount,
    poolBalance: record.poolBalanceAfterdraw,
  };
}
