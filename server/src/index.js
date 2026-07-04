import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const STATE_FILE = path.join(DATA_DIR, 'user-state.json');
const PORT = Number(process.env.PORT || 3087);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || '*';
const WECHAT_APP_ID = process.env.WECHAT_APP_ID;
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-me';
const SPORTTERY_HISTORY_PATH = '/gateway/lottery/getHistoryPageListV1.qry';
const SPORTTERY_API_BASE = 'https://webapi.sporttery.cn';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: PUBLIC_ORIGIN === '*' ? true : PUBLIC_ORIGIN,
    credentials: true,
  }),
);

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'lotto-sieve-server' });
});

app.post('/api/wechat/login', async (request, response, next) => {
  try {
    const code = String(request.body?.code || '');
    const profile = sanitizeProfile(request.body?.profile);

    if (!code) {
      response.status(400).json({ error: 'missing_code' });
      return;
    }

    if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
      response.status(500).json({ error: 'wechat_env_not_configured' });
      return;
    }

    const session = await fetchWechatSession(code);

    if (!session.openid) {
      response.status(502).json({ error: 'wechat_session_failed', detail: session });
      return;
    }

    const token = signSessionToken({
      openid: session.openid,
      unionid: session.unionid,
    });

    const store = await readStateStore();
    const existing = store.users[session.openid] || {};
    store.users[session.openid] = {
      ...existing,
      openid: session.openid,
      unionid: session.unionid,
      user: profile || existing.user,
      updatedAt: new Date().toISOString(),
    };
    await writeStateStore(store);

    response.json({
      token,
      openid: session.openid,
      user: store.users[session.openid].user,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dlt/history', async (_request, response, next) => {
  try {
    const draws = await fetchDltHistory();
    response.json({ draws });
  } catch (error) {
    next(error);
  }
});

app.get('/api/me/state', requireAuth, async (request, response, next) => {
  try {
    const store = await readStateStore();
    const user = store.users[request.session.openid] || {};

    response.json({
      config: user.config || null,
      cart: user.cart || [],
      updatedAt: user.updatedAt || null,
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/me/state', requireAuth, async (request, response, next) => {
  try {
    const store = await readStateStore();
    const existing = store.users[request.session.openid] || {};

    store.users[request.session.openid] = {
      ...existing,
      openid: request.session.openid,
      config: request.body?.config ?? existing.config ?? null,
      cart: Array.isArray(request.body?.cart) ? request.body.cart : existing.cart || [],
      updatedAt: new Date().toISOString(),
    };

    await writeStateStore(store);
    response.json({ ok: true, updatedAt: store.users[request.session.openid].updatedAt });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: 'internal_error',
    message: error instanceof Error ? error.message : 'unknown error',
  });
});

app.listen(PORT, () => {
  console.log(`lotto-sieve-server listening on ${PORT}`);
});

async function fetchWechatSession(code) {
  const params = new URLSearchParams({
    appid: WECHAT_APP_ID,
    secret: WECHAT_APP_SECRET,
    js_code: code,
    grant_type: 'authorization_code',
  });
  const url = `https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`wechat jscode2session failed: HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchDltHistory() {
  const firstPage = await fetchDltHistoryPage(1);
  const totalPages = firstPage.value?.pages || 1;
  const records = [...(firstPage.value?.list || [])];
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
  const batchSize = 4;

  for (let index = 0; index < pageNumbers.length; index += batchSize) {
    const batch = pageNumbers.slice(index, index + batchSize);
    const pages = await Promise.all(batch.map((pageNo) => fetchDltHistoryPage(pageNo)));
    pages.forEach((page) => records.push(...(page.value?.list || [])));
  }

  return normalizeDltRecords(records);
}

async function fetchDltHistoryPage(pageNo) {
  const params = new URLSearchParams({
    gameNo: '85',
    provinceId: '0',
    pageSize: '100',
    isVerify: '1',
    pageNo: String(pageNo),
  });
  const response = await fetch(`${SPORTTERY_API_BASE}${SPORTTERY_HISTORY_PATH}?${params.toString()}`, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      Referer: 'https://www.sporttery.cn/kj/kjlb.html?game=dlt',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`sporttery history failed: HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (!payload.success || !payload.value) {
    throw new Error(payload.errorMessage || 'sporttery response invalid');
  }

  return payload;
}

function normalizeDltRecords(records) {
  const byIssue = new Map();

  records.forEach((record) => {
    const draw = parseDltRecord(record);
    if (draw) byIssue.set(draw.issue, draw);
  });

  return [...byIssue.values()].sort((left, right) => {
    const dateSort = right.date.localeCompare(left.date);
    return dateSort === 0 ? right.issue.localeCompare(left.issue) : dateSort;
  });
}

function parseDltRecord(record) {
  const numbers = String(record.lotteryDrawResult || '')
    .trim()
    .split(/\s+/)
    .map((value) => Number(value));

  if (numbers.length !== 7 || numbers.some((value) => !Number.isInteger(value) || value < 1)) {
    return null;
  }

  return {
    issue: record.lotteryDrawNum,
    date: record.lotteryDrawTime,
    front: numbers.slice(0, 5).sort((left, right) => left - right),
    back: numbers.slice(5, 7).sort((left, right) => left - right),
    saleAmount: record.totalSaleAmount,
    poolBalance: record.poolBalanceAfterdraw,
  };
}

function requireAuth(request, response, next) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const session = verifySessionToken(token);

  if (!session) {
    response.status(401).json({ error: 'unauthorized' });
    return;
  }

  request.session = session;
  next();
}

function signSessionToken(payload) {
  const body = base64url(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  const signature = hmac(body);

  return `${body}.${signature}`;
}

function verifySessionToken(token) {
  const [body, signature] = token.split('.');

  if (!body || !signature || hmac(body) !== signature) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function hmac(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sanitizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return undefined;

  return {
    nickName: typeof profile.nickName === 'string' ? profile.nickName.slice(0, 80) : undefined,
    avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl.slice(0, 500) : undefined,
  };
}

async function readStateStore() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.users ? parsed : { users: {} };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { users: {} };
    }

    throw error;
  }
}

async function writeStateStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(store, null, 2), 'utf8');
}
