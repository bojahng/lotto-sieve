import { useEffect, useMemo, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Input, Slider, Text, View } from '@tarojs/components';
import { generateTickets, type GenerationResult } from '../../domain/candidate';
import {
  DEFAULT_RULE_CONFIG,
  DLT_BACK_MAX,
  DLT_FRONT_MAX,
  DltDraw,
  EvaluatedTicket,
  RuleConfig,
  formatNumber,
  formatTicket,
  range,
  ticketKey,
} from '../../domain/dlt';
import { buildDltStats, calculateTicketMetrics } from '../../domain/stats';
import { sampleDltHistory } from '../../data/sampleDltHistory';
import { AuthSession, getWechatProfile, loginWithWechat } from '../../services/auth';
import { fetchHistoryFromProxy } from '../../services/history';
import {
  clearStoredAuth,
  loadStoredCart,
  loadStoredConfig,
  loadStoredAuth,
  loadStoredHistory,
  saveStoredCart,
  saveStoredConfig,
  saveStoredAuth,
  saveStoredHistory,
} from '../../services/storage';
import { fetchUserState, saveUserState } from '../../services/userState';
import './index.scss';

type TabKey = 'rules' | 'results' | 'cart' | 'history';

type RuleCheck = {
  id: string;
  label: string;
  passed: boolean;
};

type HistoryRow = {
  draw: DltDraw;
  passed: boolean;
  failed: RuleCheck[];
  frontSum: number;
  oddPattern: string;
  sizePattern: string;
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'rules', label: '规则' },
  { key: 'results', label: '候选' },
  { key: 'cart', label: '选号篮' },
  { key: 'history', label: '历史' },
];

const defaultResult: GenerationResult = {
  accepted: [],
  rejectedSamples: [],
  attempts: 0,
  problems: [],
};

export default function IndexPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('rules');
  const [config, setConfig] = useState<RuleConfig>(() => loadStoredConfig() ?? DEFAULT_RULE_CONFIG);
  const [draws, setDraws] = useState<DltDraw[]>(() => loadStoredHistory() ?? sampleDltHistory);
  const [targetCount, setTargetCount] = useState(10);
  const [result, setResult] = useState<GenerationResult>(defaultResult);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [cart, setCart] = useState<EvaluatedTicket[]>(() => loadStoredCart());
  const [auth, setAuth] = useState<AuthSession | undefined>(() => loadStoredAuth());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const stats = useMemo(() => buildDltStats(draws, config.recentWindow), [config.recentWindow, draws]);
  const historyRows = useMemo(() => buildHistoryRows(draws, config), [config, draws]);
  const historyPassed = historyRows.filter((row) => row.passed).length;

  useEffect(() => {
    saveStoredConfig(config);
  }, [config]);

  useEffect(() => {
    saveStoredCart(cart);
  }, [cart]);

  useEffect(() => {
    if (!auth) return;

    saveUserState(auth, { config, cart }).catch((error) => {
      console.warn(error);
    });
  }, [auth, cart, config]);

  const updateConfig = <Key extends keyof RuleConfig>(key: Key, value: RuleConfig[Key]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const handleGenerate = () => {
    const next = generateTickets(draws, config, {
      targetCount,
      maxAttempts: 100000,
    });

    setResult(next);
    setSelectedKeys([]);
    setActiveTab('results');
  };

  const handleAddSelected = () => {
    const selected = result.accepted.filter((row) => selectedKeys.includes(ticketKey(row.ticket)));
    const existing = new Set(cart.map((row) => ticketKey(row.ticket)));
    const next = [...cart, ...selected.filter((row) => !existing.has(ticketKey(row.ticket)))];

    setCart(next);
    setSelectedKeys([]);
    Taro.showToast({ title: `已加入 ${next.length} 注`, icon: 'success' });
  };

  const handleCopyCart = () => {
    const text = cart.map((row, index) => `${index + 1}. ${formatTicket(row.ticket)}`).join('\n');

    if (!text) {
      Taro.showToast({ title: '选号篮为空', icon: 'none' });
      return;
    }

    Taro.setClipboardData({ data: text });
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);

    try {
      const profile = await getWechatProfile();
      const session = await loginWithWechat(profile);
      saveStoredAuth(session);
      await restoreCloudState(session);
      setAuth(session);
      Taro.showToast({ title: '登录成功', icon: 'success' });
    } catch (error) {
      console.error('login failed', error);
      Taro.showToast({
        title: error instanceof Error ? error.message : '登录失败',
        icon: 'none',
        duration: 2600,
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const restoreCloudState = async (session: AuthSession) => {
    try {
      const state = await fetchUserState(session);

      if (state.config) {
        setConfig(state.config);
        saveStoredConfig(state.config);
      }

      if (state.cart.length > 0) {
        setCart(state.cart);
        saveStoredCart(state.cart);
      }
    } catch (error) {
      console.warn(error);
    }
  };

  const handleLogout = () => {
    setAuth(undefined);
    clearStoredAuth();
    Taro.showToast({ title: '已退出登录', icon: 'none' });
  };

  const handleSyncHistory = async () => {
    setIsSyncing(true);

    try {
      const officialDraws = await fetchHistoryFromProxy();
      setDraws(officialDraws);
      saveStoredHistory(officialDraws);
      Taro.showToast({ title: '同步完成', icon: 'success' });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '同步失败',
        icon: 'none',
        duration: 2200,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <View className="page">
      <View className="hero">
        <View>
          <Text className="eyebrow">大乐透规则选号</Text>
          <Text className="title">乐筛</Text>
          <Text className="sub">
            历史 {stats.totalDraws} 期，最新 {stats.latestIssue ?? '-'}
          </Text>
        </View>
        <View className="hero-actions">
          <Button className="sync-button" loading={isSyncing} onClick={handleSyncHistory}>
            同步
          </Button>
          {auth ? (
            <Button className="login-button signed" onClick={handleLogout}>
              已登录
            </Button>
          ) : (
            <Button className="login-button" loading={isLoggingIn} onClick={handleLogin}>
              登录
            </Button>
          )}
        </View>
      </View>

      <LoginStatus auth={auth} />

      <View className="tabbar">
        {tabs.map((tab) => (
          <View
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.key === 'cart' && cart.length > 0 ? <Text className="badge">{cart.length}</Text> : null}
          </View>
        ))}
      </View>

      {activeTab === 'rules' ? (
        <RulesPanel
          config={config}
          targetCount={targetCount}
          onConfigChange={updateConfig}
          onGenerate={handleGenerate}
          onTargetCountChange={setTargetCount}
        />
      ) : null}

      {activeTab === 'results' ? (
        <ResultsPanel
          result={result}
          selectedKeys={selectedKeys}
          onAddSelected={handleAddSelected}
          onSelectedKeysChange={setSelectedKeys}
        />
      ) : null}

      {activeTab === 'cart' ? (
        <CartPanel cart={cart} onCartChange={setCart} onCopy={handleCopyCart} />
      ) : null}

      {activeTab === 'history' ? (
        <HistoryPanel passed={historyPassed} rows={historyRows} total={historyRows.length} />
      ) : null}
    </View>
  );
}

function LoginStatus({ auth }: { auth?: AuthSession }) {
  if (!auth) {
    return (
      <View className="login-card">
        <Text className="login-title">未登录</Text>
        <Text className="login-desc">登录后可绑定微信身份，后续支持云端保存规则和选号篮。</Text>
      </View>
    );
  }

  return (
    <View className="login-card">
      <Text className="login-title">{auth.user?.nickName || '微信用户'}</Text>
      <Text className="login-desc">已绑定微信身份，openid {auth.openid ? maskOpenId(auth.openid) : '由后端保存'}</Text>
    </View>
  );
}

function RulesPanel({
  config,
  targetCount,
  onConfigChange,
  onGenerate,
  onTargetCountChange,
}: {
  config: RuleConfig;
  targetCount: number;
  onConfigChange: <Key extends keyof RuleConfig>(key: Key, value: RuleConfig[Key]) => void;
  onGenerate: () => void;
  onTargetCountChange: (value: number) => void;
}) {
  return (
    <View className="stack">
      <Panel title="生成设置">
        <NumberInput label="生成注数" value={targetCount} min={1} max={50} onChange={onTargetCountChange} />
      </Panel>

      <Panel title="和值范围">
        <RangeSlider
          label="前区和值"
          max={175}
          min={15}
          value={config.frontSumRange}
          onChange={(value) => onConfigChange('frontSumRange', value)}
        />
        <RangeSlider
          label="后区和值"
          max={23}
          min={3}
          value={config.backSumRange}
          onChange={(value) => onConfigChange('backSumRange', value)}
        />
      </Panel>

      <Panel title="结构">
        <MultiChoice
          label="前区奇数个数"
          options={range(0, 5)}
          value={config.allowedFrontOddCounts}
          render={(value) => `${value} 奇 ${5 - value} 偶`}
          onChange={(value) => onConfigChange('allowedFrontOddCounts', value)}
        />
        <MultiChoice
          label="前区小号个数"
          options={range(0, 5)}
          value={config.allowedFrontSmallCounts}
          render={(value) => `${value} 小 ${5 - value} 大`}
          onChange={(value) => onConfigChange('allowedFrontSmallCounts', value)}
        />
      </Panel>

      <Panel title="过滤强度">
        <NumberInput
          label="最多连号组"
          value={config.maxConsecutiveGroups}
          min={0}
          max={4}
          onChange={(value) => onConfigChange('maxConsecutiveGroups', value)}
        />
        <NumberInput
          label="历史最大重合"
          value={config.maxFrontHistoryOverlap}
          min={0}
          max={5}
          onChange={(value) => onConfigChange('maxFrontHistoryOverlap', value)}
        />
        <NumberInput
          label="近期窗口"
          value={config.recentWindow}
          min={1}
          max={50}
          onChange={(value) => onConfigChange('recentWindow', value)}
        />
      </Panel>

      <Panel title="手动号码">
        <NumberGrid
          label="前区胆码"
          max={DLT_FRONT_MAX}
          selected={config.requiredFront}
          tone="front"
          onChange={(value) => onConfigChange('requiredFront', value)}
        />
        <NumberGrid
          label="前区排除"
          max={DLT_FRONT_MAX}
          selected={config.excludedFront}
          tone="muted"
          onChange={(value) => onConfigChange('excludedFront', value)}
        />
        <NumberGrid
          label="后区胆码"
          max={DLT_BACK_MAX}
          selected={config.requiredBack}
          tone="back"
          onChange={(value) => onConfigChange('requiredBack', value)}
        />
        <NumberGrid
          label="后区排除"
          max={DLT_BACK_MAX}
          selected={config.excludedBack}
          tone="muted"
          onChange={(value) => onConfigChange('excludedBack', value)}
        />
      </Panel>

      <Button className="primary-button" onClick={onGenerate}>
        生成候选
      </Button>
    </View>
  );
}

function ResultsPanel({
  result,
  selectedKeys,
  onAddSelected,
  onSelectedKeysChange,
}: {
  result: GenerationResult;
  selectedKeys: string[];
  onAddSelected: () => void;
  onSelectedKeysChange: (keys: string[]) => void;
}) {
  return (
    <View className="stack">
      <View className="summary-grid">
        <Metric label="尝试次数" value={`${result.attempts}`} />
        <Metric label="通过数量" value={`${result.accepted.length}`} />
      </View>

      {result.problems.length > 0 ? (
        <View className="notice">{result.problems.join('；')}</View>
      ) : null}

      <Button className="primary-button" disabled={selectedKeys.length === 0} onClick={onAddSelected}>
        加入选号篮
      </Button>

      {result.accepted.length === 0 ? <EmptyText text="还没有候选结果" /> : null}
      {result.accepted.map((row) => (
        <TicketCard
          key={ticketKey(row.ticket)}
          row={row}
          selected={selectedKeys.includes(ticketKey(row.ticket))}
          onClick={() => onSelectedKeysChange(toggleKey(selectedKeys, ticketKey(row.ticket)))}
        />
      ))}
    </View>
  );
}

function CartPanel({
  cart,
  onCartChange,
  onCopy,
}: {
  cart: EvaluatedTicket[];
  onCartChange: (cart: EvaluatedTicket[]) => void;
  onCopy: () => void;
}) {
  return (
    <View className="stack">
      <View className="summary-grid">
        <Metric label="选号篮" value={`${cart.length} 注`} />
        <Metric label="操作" value="复制下单" />
      </View>
      <Button className="primary-button" onClick={onCopy}>
        复制选号
      </Button>
      <Button className="ghost-button" onClick={() => onCartChange([])}>
        清空选号篮
      </Button>
      {cart.length === 0 ? <EmptyText text="选号篮为空" /> : null}
      {cart.map((row) => (
        <TicketCard
          key={ticketKey(row.ticket)}
          row={row}
          onClick={() => onCartChange(cart.filter((item) => ticketKey(item.ticket) !== ticketKey(row.ticket)))}
        />
      ))}
    </View>
  );
}

function HistoryPanel({ passed, rows, total }: { passed: number; rows: HistoryRow[]; total: number }) {
  const rate = total === 0 ? 0 : ((passed / total) * 100).toFixed(1);

  return (
    <View className="stack">
      <View className="summary-grid">
        <Metric label="当前规则通过" value={`${passed}/${total}`} />
        <Metric label="通过率" value={`${rate}%`} />
      </View>

      {rows.slice(0, 30).map((row) => (
        <View key={row.draw.issue} className="history-card">
          <View className="history-head">
            <Text className="issue">{row.draw.issue}</Text>
            <Text className={row.passed ? 'pass' : 'fail'}>{row.passed ? '通过' : '未通过'}</Text>
          </View>
          <View className="ticket-line">
            <BallRow numbers={row.draw.front} tone="front" />
            <Text className="plus">+</Text>
            <BallRow numbers={row.draw.back} tone="back" />
          </View>
          <Text className="meta">
            和值 {row.frontSum}，{row.oddPattern}，{row.sizePattern}
          </Text>
          {row.failed.length > 0 ? (
            <Text className="meta">失败：{row.failed.map((rule) => rule.label).join('、')}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View className="panel">
      <Text className="panel-title">{title}</Text>
      {children}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="metric">
      <Text>{label}</Text>
      <Text className="metric-value">{value}</Text>
    </View>
  );
}

function NumberInput({
  label,
  max,
  min,
  value,
  onChange,
}: {
  label: string;
  max: number;
  min: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View className="field">
      <View className="field-head">
        <Text>{label}</Text>
        <Input
          className="number-input"
          type="number"
          value={String(value)}
          onInput={(event) => onChange(clamp(Number(event.detail.value), min, max))}
        />
      </View>
      <Slider
        activeColor="#1f7a4d"
        blockSize={20}
        max={max}
        min={min}
        value={value}
        onChange={(event) => onChange(Number(event.detail.value))}
      />
    </View>
  );
}

function RangeSlider({
  label,
  max,
  min,
  value,
  onChange,
}: {
  label: string;
  max: number;
  min: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}) {
  return (
    <View className="field">
      <Text className="field-label">
        {label}：{value[0]} - {value[1]}
      </Text>
      <Slider
        activeColor="#1f7a4d"
        blockSize={20}
        max={max}
        min={min}
        value={value[0]}
        onChange={(event) => onChange([Number(event.detail.value), Math.max(value[1], Number(event.detail.value))])}
      />
      <Slider
        activeColor="#b84b30"
        blockSize={20}
        max={max}
        min={min}
        value={value[1]}
        onChange={(event) => onChange([Math.min(value[0], Number(event.detail.value)), Number(event.detail.value)])}
      />
    </View>
  );
}

function MultiChoice({
  label,
  options,
  render,
  value,
  onChange,
}: {
  label: string;
  options: number[];
  render: (value: number) => string;
  value: number[];
  onChange: (value: number[]) => void;
}) {
  return (
    <View className="field">
      <Text className="field-label">{label}</Text>
      <View className="choice-row">
        {options.map((option) => (
          <View
            key={option}
            className={`choice ${value.includes(option) ? 'active' : ''}`}
            onClick={() => onChange(toggleNumber(value, option))}
          >
            {render(option)}
          </View>
        ))}
      </View>
    </View>
  );
}

function NumberGrid({
  label,
  max,
  selected,
  tone,
  onChange,
}: {
  label: string;
  max: number;
  selected: number[];
  tone: 'front' | 'back' | 'muted';
  onChange: (value: number[]) => void;
}) {
  return (
    <View className="field">
      <Text className="field-label">{label}</Text>
      <View className="number-grid">
        {range(1, max).map((number) => (
          <View
            key={number}
            className={`pick-number ${tone} ${selected.includes(number) ? 'active' : ''}`}
            onClick={() => onChange(toggleNumber(selected, number))}
          >
            {formatNumber(number)}
          </View>
        ))}
      </View>
    </View>
  );
}

function TicketCard({
  row,
  selected,
  onClick,
}: {
  row: EvaluatedTicket;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <View className={`ticket-card ${selected ? 'selected' : ''}`} onClick={onClick}>
      <View className="ticket-line">
        <BallRow numbers={row.ticket.front} tone="front" />
        <Text className="plus">+</Text>
        <BallRow numbers={row.ticket.back} tone="back" />
      </View>
      <Text className="meta">
        前和 {row.metrics.frontSum} / 后和 {row.metrics.backSum} / 连号 {row.metrics.consecutiveGroups}
      </Text>
    </View>
  );
}

function BallRow({ numbers, tone }: { numbers: number[]; tone: 'front' | 'back' }) {
  return (
    <View className="ball-row">
      {numbers.map((number) => (
        <Text key={number} className={`ball ${tone}`}>
          {formatNumber(number)}
        </Text>
      ))}
    </View>
  );
}

function EmptyText({ text }: { text: string }) {
  return <View className="empty">{text}</View>;
}

function buildHistoryRows(draws: DltDraw[], config: RuleConfig): HistoryRow[] {
  const stats = buildDltStats(draws, config.recentWindow);

  return draws.map((draw) => {
    const peerDraws = draws.filter((item) => item.issue !== draw.issue);
    const metrics = calculateTicketMetrics(
      { front: draw.front, back: draw.back },
      peerDraws,
      stats.recentFrontNumbers,
      stats.recentBackNumbers,
    );
    const checks = evaluateHistoricalDraw(draw, metrics, config);
    const failed = checks.filter((check) => !check.passed);

    return {
      draw,
      passed: failed.length === 0,
      failed,
      frontSum: metrics.frontSum,
      oddPattern: `${metrics.frontOddCount} 奇 ${metrics.frontEvenCount} 偶`,
      sizePattern: `${metrics.frontSmallCount} 小 ${metrics.frontBigCount} 大`,
    };
  });
}

function evaluateHistoricalDraw(
  draw: DltDraw,
  metrics: ReturnType<typeof calculateTicketMetrics>,
  config: RuleConfig,
): RuleCheck[] {
  return [
    {
      id: 'front-sum',
      label: '前区和值',
      passed: metrics.frontSum >= config.frontSumRange[0] && metrics.frontSum <= config.frontSumRange[1],
    },
    {
      id: 'back-sum',
      label: '后区和值',
      passed: metrics.backSum >= config.backSumRange[0] && metrics.backSum <= config.backSumRange[1],
    },
    {
      id: 'odd',
      label: '奇偶',
      passed: config.allowedFrontOddCounts.includes(metrics.frontOddCount),
    },
    {
      id: 'size',
      label: '大小',
      passed: config.allowedFrontSmallCounts.includes(metrics.frontSmallCount),
    },
    {
      id: 'manual-front',
      label: '前区手动号',
      passed:
        config.requiredFront.every((number) => draw.front.includes(number)) &&
        draw.front.every((number) => !config.excludedFront.includes(number)),
    },
    {
      id: 'manual-back',
      label: '后区手动号',
      passed:
        config.requiredBack.every((number) => draw.back.includes(number)) &&
        draw.back.every((number) => !config.excludedBack.includes(number)),
    },
    {
      id: 'consecutive',
      label: '连号',
      passed: metrics.consecutiveGroups <= config.maxConsecutiveGroups,
    },
    {
      id: 'overlap',
      label: '历史重合',
      passed: metrics.maxFrontHistoryOverlap <= config.maxFrontHistoryOverlap,
    },
  ];
}

function toggleNumber(values: number[], value: number) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value].sort((left, right) => left - right);
}

function toggleKey(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function maskOpenId(openid: string) {
  if (openid.length <= 8) {
    return openid;
  }

  return `${openid.slice(0, 4)}...${openid.slice(-4)}`;
}
