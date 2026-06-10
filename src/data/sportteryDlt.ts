import { DltDraw, range, toBackNumbers, toFrontNumbers } from '../domain/dlt';

const SPORTTERY_API_BASE = import.meta.env.DEV
  ? '/sporttery-api'
  : 'https://webapi.sporttery.cn';

const HISTORY_PATH = '/gateway/lottery/getHistoryPageListV1.qry';
const PAGE_SIZE = 100;

type SportteryHistoryResponse = {
  success: boolean;
  errorMessage?: string;
  value?: {
    total: number;
    pages: number;
    pageNo: number;
    pageSize: number;
    list: SportteryDrawRecord[];
  };
};

type SportteryDrawRecord = {
  lotteryDrawNum: string;
  lotteryDrawResult: string;
  lotteryDrawTime: string;
  drawPdfUrl?: string;
  poolBalanceAfterdraw?: string;
  totalSaleAmount?: string;
};

export type SportteryFetchProgress = {
  loadedPages: number;
  totalPages: number;
  loadedDraws: number;
};

export type SportteryFetchResult = {
  draws: DltDraw[];
  total: number;
  pages: number;
};

export async function fetchDltHistoryFromSporttery(
  onProgress?: (progress: SportteryFetchProgress) => void,
): Promise<SportteryFetchResult> {
  const firstPage = await fetchHistoryPage(1);
  const totalPages = firstPage.value?.pages ?? 1;
  const total = firstPage.value?.total ?? firstPage.value?.list.length ?? 0;
  const records = [...(firstPage.value?.list ?? [])];
  let loadedPages = 1;

  onProgress?.({
    loadedPages,
    totalPages,
    loadedDraws: records.length,
  });

  const pageNumbers = range(2, totalPages);
  const batchSize = 4;

  for (let index = 0; index < pageNumbers.length; index += batchSize) {
    const batch = pageNumbers.slice(index, index + batchSize);
    const pages = await Promise.all(batch.map((pageNo) => fetchHistoryPage(pageNo)));

    pages.forEach((page) => {
      records.push(...(page.value?.list ?? []));
    });

    loadedPages += pages.length;
    onProgress?.({
      loadedPages,
      totalPages,
      loadedDraws: records.length,
    });
  }

  const draws = normalizeOfficialDraws(records);

  if (draws.length === 0) {
    throw new Error('官方接口没有返回可用的大乐透开奖数据');
  }

  return {
    draws,
    total,
    pages: totalPages,
  };
}

async function fetchHistoryPage(pageNo: number): Promise<SportteryHistoryResponse> {
  const params = new URLSearchParams({
    gameNo: '85',
    provinceId: '0',
    pageSize: String(PAGE_SIZE),
    isVerify: '1',
    pageNo: String(pageNo),
  });
  const response = await fetch(`${SPORTTERY_API_BASE}${HISTORY_PATH}?${params.toString()}`, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
    },
  });

  if (!response.ok) {
    throw new Error(`官方接口请求失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as SportteryHistoryResponse;

  if (!payload.success || !payload.value) {
    throw new Error(payload.errorMessage || '官方接口返回异常');
  }

  return payload;
}

function normalizeOfficialDraws(records: SportteryDrawRecord[]) {
  const byIssue = new Map<string, DltDraw>();

  records.forEach((record) => {
    const draw = parseSportteryDraw(record);

    if (draw) {
      byIssue.set(draw.issue, draw);
    }
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

  if (
    numbers.length !== 7 ||
    numbers.some((value) => !Number.isInteger(value) || value < 1)
  ) {
    return null;
  }

  return {
    issue: record.lotteryDrawNum,
    date: record.lotteryDrawTime,
    front: toFrontNumbers(numbers.slice(0, 5)),
    back: toBackNumbers(numbers.slice(5, 7)),
    source: 'sporttery',
    rawResult: record.lotteryDrawResult,
    saleAmount: record.totalSaleAmount,
    poolBalance: record.poolBalanceAfterdraw,
    drawPdfUrl: record.drawPdfUrl,
  };
}
