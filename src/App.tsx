import { type Key, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  ConfigProvider,
  Drawer,
  Empty,
  FloatButton,
  InputNumber,
  Progress,
  Select,
  Slider,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import type { CheckboxOptionType } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChart3,
  CloudDownload,
  Copy as CopyIcon,
  Database,
  Filter,
  HelpCircle,
  ImageDown,
  Plus,
  Play,
  RotateCcw,
  Settings2,
  ShoppingCart,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { generateTickets } from './domain/candidate';
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
} from './domain/dlt';
import { NumberStat, buildDltStats } from './domain/stats';
import { sampleDltHistory } from './data/sampleDltHistory';
import { loadCachedDltHistory, saveCachedDltHistory } from './data/dltHistoryCache';
import {
  SportteryFetchProgress,
  fetchDltHistoryFromSporttery,
} from './data/sportteryDlt';

const { Text, Title } = Typography;

const frontOptions = range(1, DLT_FRONT_MAX).map((value) => ({
  label: formatNumber(value),
  value,
}));

const backOptions = range(1, DLT_BACK_MAX).map((value) => ({
  label: formatNumber(value),
  value,
}));

const oddOptions: CheckboxOptionType<number>[] = range(0, 5).map((value) => ({
  label: `${value} 奇 ${5 - value} 偶`,
  value,
}));

const sizeOptions: CheckboxOptionType<number>[] = range(0, 5).map((value) => ({
  label: `${value} 小 ${5 - value} 大`,
  value,
}));

type DataInfo = {
  label: string;
  status: 'sample' | 'cache' | 'official';
  syncedAt?: string;
  total?: number;
  pages?: number;
  error?: string;
};

type DataState = {
  draws: DltDraw[];
  info: DataInfo;
};

type ImagePreview = {
  dataUrl: string;
  filename: string;
  title: string;
};

function createInitialDataState(): DataState {
  const cached = loadCachedDltHistory();

  if (cached) {
    return {
      draws: cached.draws,
      info: {
        label: '官方缓存',
        status: 'cache',
        syncedAt: cached.syncedAt,
        total: cached.draws.length,
      },
    };
  }

  return {
    draws: sampleDltHistory,
    info: {
      label: '内置样例',
      status: 'sample',
      total: sampleDltHistory.length,
    },
  };
}

export function App() {
  const initialData = useMemo(() => createInitialDataState(), []);
  const [dataState, setDataState] = useState<DataState>(initialData);
  const [config, setConfig] = useState<RuleConfig>(DEFAULT_RULE_CONFIG);
  const [targetCount, setTargetCount] = useState(10);
  const [maxAttempts, setMaxAttempts] = useState(100000);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SportteryFetchProgress | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [result, setResult] = useState(() =>
    generateTickets(initialData.draws, DEFAULT_RULE_CONFIG, {
      targetCount: 10,
      maxAttempts: 100000,
    }),
  );
  const [selectedTicketKeys, setSelectedTicketKeys] = useState<Key[]>([]);
  const [selectionFeedback, setSelectionFeedback] = useState<string>();
  const [cartTickets, setCartTickets] = useState<EvaluatedTicket[]>([]);
  const [cartFeedback, setCartFeedback] = useState<string>();
  const [imagePreview, setImagePreview] = useState<ImagePreview>();
  const draws = dataState.draws;
  const dataInfo = dataState.info;

  const stats = useMemo(
    () => buildDltStats(draws, config.recentWindow),
    [draws, config.recentWindow],
  );

  const selectedTickets = useMemo(() => {
    const selectedKeySet = new Set(selectedTicketKeys);

    return result.accepted.filter((row) => selectedKeySet.has(getTicketRowKey(row)));
  }, [result.accepted, selectedTicketKeys]);

  const updateConfig = <Key extends keyof RuleConfig>(key: Key, value: RuleConfig[Key]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const clearTicketSelection = () => {
    setSelectedTicketKeys([]);
    setSelectionFeedback(undefined);
  };

  const handleGenerate = () => {
    const nextResult = generateTickets(draws, config, {
      targetCount,
      maxAttempts,
    });
    setResult(nextResult);
    clearTicketSelection();
  };

  const handleSyncOfficial = async () => {
    setIsSyncing(true);
    setSyncProgress(null);
    setDataState((current) => ({
      ...current,
      info: {
        ...current.info,
        error: undefined,
      },
    }));

    try {
      const official = await fetchDltHistoryFromSporttery(setSyncProgress);
      const syncedAt = new Date().toLocaleString('zh-CN', { hour12: false });

      saveCachedDltHistory(official.draws, syncedAt);
      setDataState({
        draws: official.draws,
        info: {
          label: '官方数据',
          status: 'official',
          syncedAt,
          total: official.total,
          pages: official.pages,
        },
      });
      setResult(
        generateTickets(official.draws, config, {
          targetCount,
          maxAttempts,
        }),
      );
      clearTicketSelection();
    } catch (error) {
      setDataState((current) => ({
        ...current,
        info: {
          ...current.info,
          error: error instanceof Error ? error.message : '官方数据同步失败',
        },
      }));
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_RULE_CONFIG);
    setTargetCount(10);
    setMaxAttempts(100000);
    setResult(
      generateTickets(draws, DEFAULT_RULE_CONFIG, {
        targetCount: 10,
        maxAttempts: 100000,
      }),
    );
    clearTicketSelection();
  };

  const handleCopySelectedTickets = async () => {
    if (selectedTickets.length === 0) {
      return;
    }

    const content = selectedTickets
      .map((row, index) => `${index + 1}. ${formatTicket(row.ticket)}`)
      .join('\n');

    try {
      await copyTextToClipboard(content);
      setSelectionFeedback(`已复制 ${selectedTickets.length} 注选号`);
    } catch {
      setSelectionFeedback('复制失败，请检查浏览器剪贴板权限');
    }
  };

  const handleExportSelectedTickets = () => {
    if (selectedTickets.length === 0) {
      return;
    }

    try {
      const exported = exportTicketsImage(selectedTickets);
      triggerImageDownload(exported);
      setImagePreview({
        ...exported,
        title: '候选号码图片',
      });
      setSelectionFeedback(`已生成 ${selectedTickets.length} 注图片`);
    } catch {
      setSelectionFeedback('导出图片失败，请稍后重试');
    }
  };

  const addTicketsToCart = (tickets: EvaluatedTicket[]) => {
    if (tickets.length === 0) {
      return;
    }

    const seenKeys = new Set(cartTickets.map(getTicketRowKey));
    const additions: EvaluatedTicket[] = [];
    let duplicateCount = 0;

    tickets.forEach((ticket) => {
      const key = getTicketRowKey(ticket);

      if (seenKeys.has(key)) {
        duplicateCount += 1;
        return;
      }

      seenKeys.add(key);
      additions.push(ticket);
    });

    setCartTickets((current) => [...current, ...additions]);

    const message =
      duplicateCount > 0
        ? `已加入 ${additions.length} 注，跳过重复 ${duplicateCount} 注`
        : `已加入 ${additions.length} 注选号篮`;

    setSelectionFeedback(message);
    setCartFeedback(message);

    if (additions.length > 0) {
      setIsCartOpen(true);
    }
  };

  const handleAddSelectedToCart = () => {
    addTicketsToCart(selectedTickets);
  };

  const handleAddAllAcceptedToCart = () => {
    addTicketsToCart(result.accepted);
  };

  const handleRemoveCartTicket = (key: string) => {
    setCartTickets((current) => current.filter((ticket) => getTicketRowKey(ticket) !== key));
    setCartFeedback('已从选号篮移除 1 注');
  };

  const handleClearCart = () => {
    setCartTickets([]);
    setCartFeedback(undefined);
  };

  const handleCopyCartTickets = async () => {
    if (cartTickets.length === 0) {
      return;
    }

    try {
      await copyTextToClipboard(formatTicketList(cartTickets));
      setCartFeedback(`已复制选号篮 ${cartTickets.length} 注`);
    } catch {
      setCartFeedback('复制失败，请检查浏览器剪贴板权限');
    }
  };

  const handleExportCartTickets = () => {
    if (cartTickets.length === 0) {
      return;
    }

    try {
      const exported = exportTicketsImage(cartTickets, {
        title: '乐筛选号清单',
        filenamePrefix: '乐筛选号清单',
        subtitle: '下单前确认',
      });
      triggerImageDownload(exported);
      setImagePreview({
        ...exported,
        title: '选号篮下单图',
      });
      setCartFeedback(`已生成选号篮 ${cartTickets.length} 注图片`);
    } catch {
      setCartFeedback('导出下单图失败，请稍后重试');
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#b42318',
          colorInfo: '#0f6cbd',
          colorSuccess: '#1f7a4d',
          colorWarning: '#c56a09',
          borderRadius: 6,
          fontFamily:
            '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
        },
      }}
    >
      <main className="app-shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              <Sparkles size={15} />
              <span>Lotto Sieve</span>
            </div>
            <Title level={1}>乐筛</Title>
          </div>
          <Space wrap>
            <Button icon={<HelpCircle size={16} />} onClick={() => setIsHelpOpen(true)}>
              帮助
            </Button>
            <Badge count={cartTickets.length} size="small">
              <Button icon={<ShoppingCart size={16} />} onClick={() => setIsCartOpen(true)}>
                选号篮
              </Button>
            </Badge>
            <Button
              icon={<CloudDownload size={16} />}
              loading={isSyncing}
              onClick={handleSyncOfficial}
            >
              同步官方数据
            </Button>
            <Tooltip title="恢复默认规则">
              <Button icon={<RotateCcw size={16} />} onClick={handleReset}>
                重置
              </Button>
            </Tooltip>
          </Space>
        </header>

        <section className="summary-grid">
          <Metric label="历史期数" value={stats.totalDraws} suffix="期" icon={<Database size={18} />} />
          <Metric label="最新期号" value={stats.latestIssue ?? '-'} icon={<Filter size={18} />} />
          <Metric label="尝试次数" value={result.attempts} suffix="次" icon={<Settings2 size={18} />} />
          <Metric label="通过数量" value={result.accepted.length} suffix="注" icon={<BarChart3 size={18} />} />
        </section>

        <section className="data-strip">
          <div className="data-strip-main">
            <Database size={16} />
            <span>数据源：{dataInfo.label}</span>
            <span>开奖 {draws.length} 期</span>
            {dataInfo.syncedAt ? <span>同步：{dataInfo.syncedAt}</span> : null}
          </div>
          {syncProgress ? (
            <div className="sync-progress">
              <span>
                正在同步 {syncProgress.loadedPages}/{syncProgress.totalPages} 页
              </span>
              <Progress
                percent={Math.round(
                  (syncProgress.loadedPages / syncProgress.totalPages) * 100,
                )}
                size="small"
                showInfo={false}
              />
            </div>
          ) : dataInfo.pages ? (
            <Text type="secondary">官方接口 {dataInfo.pages} 页</Text>
          ) : (
            <Text type="secondary">等待同步官方数据</Text>
          )}
        </section>

        {dataInfo.error ? (
          <Alert
            className="problem-alert"
            type="error"
            showIcon
            message={dataInfo.error}
          />
        ) : null}

        {result.problems.length > 0 ? (
          <Alert
            className="problem-alert"
            type="warning"
            showIcon
            message={result.problems.join('；')}
          />
        ) : null}

        <section className="workbench">
          <aside className="rule-panel">
            <div className="section-heading">
              <Settings2 size={18} />
              <span>规则配置</span>
            </div>

            <RuleBlock title="生成数量">
              <div className="inline-grid">
                <Field label="目标注数">
                  <InputNumber
                    min={1}
                    max={100}
                    value={targetCount}
                    onChange={(value) => setTargetCount(value ?? 10)}
                  />
                </Field>
                <Field label="尝试上限">
                  <InputNumber
                    min={1000}
                    max={1000000}
                    step={1000}
                    value={maxAttempts}
                    onChange={(value) => setMaxAttempts(value ?? 100000)}
                  />
                </Field>
              </div>
            </RuleBlock>

            <RuleBlock title="和值">
              <Field label={`前区 ${config.frontSumRange[0]}-${config.frontSumRange[1]}`}>
                <Slider
                  range
                  min={15}
                  max={165}
                  value={config.frontSumRange}
                  onChange={(value) => updateConfig('frontSumRange', value as [number, number])}
                />
              </Field>
              <Field label={`后区 ${config.backSumRange[0]}-${config.backSumRange[1]}`}>
                <Slider
                  range
                  min={3}
                  max={23}
                  value={config.backSumRange}
                  onChange={(value) => updateConfig('backSumRange', value as [number, number])}
                />
              </Field>
            </RuleBlock>

            <RuleBlock title="结构">
              <Field label="前区奇偶">
                <Checkbox.Group
                  className="check-grid"
                  options={oddOptions}
                  value={config.allowedFrontOddCounts}
                  onChange={(values) =>
                    updateConfig('allowedFrontOddCounts', values.map(Number))
                  }
                />
              </Field>
              <Field label="前区大小">
                <Checkbox.Group
                  className="check-grid"
                  options={sizeOptions}
                  value={config.allowedFrontSmallCounts}
                  onChange={(values) =>
                    updateConfig('allowedFrontSmallCounts', values.map(Number))
                  }
                />
              </Field>
            </RuleBlock>

            <RuleBlock title="相似度">
              <div className="inline-grid">
                <Field label="连号上限">
                  <InputNumber
                    min={0}
                    max={4}
                    value={config.maxConsecutiveGroups}
                    onChange={(value) => updateConfig('maxConsecutiveGroups', value ?? 1)}
                  />
                </Field>
                <Field label="历史重合">
                  <InputNumber
                    min={0}
                    max={5}
                    value={config.maxFrontHistoryOverlap}
                    onChange={(value) => updateConfig('maxFrontHistoryOverlap', value ?? 3)}
                  />
                </Field>
              </div>
            </RuleBlock>

            <RuleBlock title="近期号码">
              <div className="inline-grid">
                <Field label="近 N 期">
                  <InputNumber
                    min={1}
                    max={100}
                    value={config.recentWindow}
                    onChange={(value) => updateConfig('recentWindow', value ?? 10)}
                  />
                </Field>
                <Field label="前区上限">
                  <InputNumber
                    min={0}
                    max={5}
                    value={config.maxRecentFrontCount}
                    onChange={(value) => updateConfig('maxRecentFrontCount', value ?? 3)}
                  />
                </Field>
                <Field label="后区上限">
                  <InputNumber
                    min={0}
                    max={2}
                    value={config.maxRecentBackCount}
                    onChange={(value) => updateConfig('maxRecentBackCount', value ?? 1)}
                  />
                </Field>
              </div>
            </RuleBlock>

            <RuleBlock title="手动号码">
              <Field label="前区胆码">
                <Select
                  mode="multiple"
                  allowClear
                  maxCount={5}
                  options={frontOptions}
                  value={config.requiredFront}
                  onChange={(value) => updateConfig('requiredFront', value)}
                />
              </Field>
              <Field label="前区排除">
                <Select
                  mode="multiple"
                  allowClear
                  options={frontOptions}
                  value={config.excludedFront}
                  onChange={(value) => updateConfig('excludedFront', value)}
                />
              </Field>
              <Field label="后区胆码">
                <Select
                  mode="multiple"
                  allowClear
                  maxCount={2}
                  options={backOptions}
                  value={config.requiredBack}
                  onChange={(value) => updateConfig('requiredBack', value)}
                />
              </Field>
              <Field label="后区排除">
                <Select
                  mode="multiple"
                  allowClear
                  options={backOptions}
                  value={config.excludedBack}
                  onChange={(value) => updateConfig('excludedBack', value)}
                />
              </Field>
            </RuleBlock>

            <div className="rule-action-footer">
              <Button
                type="primary"
                size="large"
                block
                icon={<Play size={17} />}
                onClick={handleGenerate}
              >
                生成候选
              </Button>
              <Text type="secondary">生成后在右侧勾选号码，加入选号篮后统一导出。</Text>
            </div>
          </aside>

          <section className="result-panel">
            <Tabs
              items={[
                {
                  key: 'accepted',
                  label: `候选结果 ${result.accepted.length}`,
                  children: (
                    <TicketTable
                      rows={result.accepted}
                      selectedRowKeys={selectedTicketKeys}
                      selectedCount={selectedTickets.length}
                      feedback={selectionFeedback}
                      onSelectionChange={(keys) => {
                        setSelectedTicketKeys(keys);
                        setSelectionFeedback(undefined);
                      }}
                      onAddSelectedToCart={handleAddSelectedToCart}
                      onAddAllToCart={handleAddAllAcceptedToCart}
                      onCopySelected={handleCopySelectedTickets}
                      onExportSelected={handleExportSelectedTickets}
                    />
                  ),
                },
                {
                  key: 'rejected',
                  label: `排除样例 ${result.rejectedSamples.length}`,
                  children: <RejectedTable rows={result.rejectedSamples} />,
                },
                {
                  key: 'stats',
                  label: '号码统计',
                  children: <StatsView frontStats={stats.frontStats} backStats={stats.backStats} />,
                },
                {
                  key: 'history',
                  label: '历史数据',
                  children: <HistoryTable draws={draws} />,
                },
              ]}
            />
          </section>
        </section>
        <HelpDrawer open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        <CartDrawer
          open={isCartOpen}
          rows={cartTickets}
          feedback={cartFeedback}
          onClose={() => setIsCartOpen(false)}
          onCopy={handleCopyCartTickets}
          onExport={handleExportCartTickets}
          onClear={handleClearCart}
          onRemove={handleRemoveCartTicket}
        />
        <ImagePreviewDrawer
          preview={imagePreview}
          onClose={() => setImagePreview(undefined)}
        />
        <FloatButton.BackTop tooltip="回到顶部" visibilityHeight={240} />
      </main>
    </ConfigProvider>
  );
}

function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer
      title="帮助说明"
      open={open}
      onClose={onClose}
      width={520}
      className="help-drawer"
    >
      <div className="help-intro">
        <Text strong>乐筛用于把选号偏好变成可调整的筛选规则。</Text>
        <Text type="secondary">工具只负责数据整理、规则过滤和候选展示，不提供购买或出票服务。</Text>
      </div>

      <Collapse
        bordered={false}
        defaultActiveKey={['start', 'rules']}
        items={[
          {
            key: 'start',
            label: '快速开始',
            children: (
              <ol className="help-list">
                <li>点击“同步官方数据”，获取大乐透历史开奖数据。</li>
                <li>在左侧调整规则，例如和值、奇偶、大小、连号和胆码。</li>
                <li>点击规则配置底部的“生成候选”，系统会随机生成号码并逐条筛选。</li>
                <li>在候选结果中勾选号码，加入选号篮。</li>
                <li>打开选号篮，复制清单或导出下单图。</li>
                <li>继续查看排除样例、号码统计和历史数据。</li>
              </ol>
            ),
          },
          {
            key: 'metrics',
            label: '顶部指标',
            children: (
              <dl className="help-dl">
                <dt>历史期数</dt>
                <dd>当前数据源里已经载入的开奖期数。</dd>
                <dt>最新期号</dt>
                <dd>当前历史数据中日期最新的一期开奖期号。</dd>
                <dt>尝试次数</dt>
                <dd>本次生成时随机产生并检查过多少组号码。</dd>
                <dt>通过数量</dt>
                <dd>通过全部启用规则后被保留下来的候选注数。</dd>
              </dl>
            ),
          },
          {
            key: 'rules',
            label: '规则配置',
            children: (
              <dl className="help-dl">
                <dt>生成数量</dt>
                <dd>目标注数是想要输出的候选数量；尝试上限是最多检查多少组随机号码。</dd>
                <dt>和值</dt>
                <dd>前区或后区号码相加后的数值范围，超出范围会被排除。</dd>
                <dt>前区奇偶</dt>
                <dd>控制前区 5 个号码中奇数和偶数的数量比例。</dd>
                <dt>前区大小</dt>
                <dd>1-17 为小号，18-35 为大号，用来控制大小号结构。</dd>
                <dt>连号上限</dt>
                <dd>限制前区出现连续号码的组数，例如 08、09 算 1 组连号。</dd>
                <dt>历史重合</dt>
                <dd>限制候选前区与任意历史期开奖前区最多重合多少个号码。</dd>
                <dt>近期号码</dt>
                <dd>观察最近 N 期，限制候选中来自近期号码集合的数量。</dd>
                <dt>手动号码</dt>
                <dd>胆码是必须包含的号码；排除号是不能出现的号码。</dd>
              </dl>
            ),
          },
          {
            key: 'tabs',
            label: '结果区域',
            children: (
              <dl className="help-dl">
                <dt>候选结果</dt>
                <dd>展示通过全部规则的号码组合和关键指标；勾选后可加入选号篮，也可临时复制或导出 PNG 图片。</dd>
                <dt>选号篮</dt>
                <dd>保存最终认可的号码，支持移除、清空、复制清单和导出下单图。</dd>
                <dt>排除样例</dt>
                <dd>展示部分被筛掉的号码，以及它们首先失败的规则。</dd>
                <dt>号码统计</dt>
                <dd>展示每个号码在历史数据中的出现次数、遗漏和冷热状态。</dd>
                <dt>历史数据</dt>
                <dd>展示当前载入的开奖历史，包括期号、日期、开奖号码、销量和奖池。</dd>
              </dl>
            ),
          },
          {
            key: 'data',
            label: '数据来源',
            children: (
              <ul className="help-list">
                <li>官方数据来自中国体育彩票大乐透历史开奖接口。</li>
                <li>同步成功后会缓存在当前浏览器，下次打开优先使用缓存。</li>
                <li>如果同步失败或没有缓存，页面会继续使用内置样例数据。</li>
              </ul>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

function CartDrawer({
  open,
  rows,
  feedback,
  onClose,
  onCopy,
  onExport,
  onClear,
  onRemove,
}: {
  open: boolean;
  rows: EvaluatedTicket[];
  feedback?: string;
  onClose: () => void;
  onCopy: () => void;
  onExport: () => void;
  onClear: () => void;
  onRemove: (key: string) => void;
}) {
  const columns: ColumnsType<EvaluatedTicket> = [
    {
      title: '#',
      width: 48,
      render: (_value, _record, index) => <Text type="secondary">{index + 1}</Text>,
    },
    {
      title: '前区',
      dataIndex: ['ticket', 'front'],
      render: (numbers: number[]) => <NumberBalls numbers={numbers} zone="front" />,
    },
    {
      title: '后区',
      dataIndex: ['ticket', 'back'],
      render: (numbers: number[]) => <NumberBalls numbers={numbers} zone="back" />,
    },
    {
      title: '指标',
      render: (_, record) => (
        <Space wrap size={[4, 6]}>
          <Tag>前和 {record.metrics.frontSum}</Tag>
          <Tag>后和 {record.metrics.backSum}</Tag>
          <Tag>{record.metrics.frontOddCount} 奇</Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 72,
      render: (_, record) => (
        <Tooltip title="移出选号篮">
          <Button
            type="text"
            danger
            icon={<Trash2 size={16} />}
            onClick={() => onRemove(getTicketRowKey(record))}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Drawer
      title={
        <Space>
          <ShoppingCart size={18} />
          <span>选号篮</span>
          <Tag color="red">{rows.length} 注</Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={720}
      className="cart-drawer"
      footer={
        <div className="cart-footer">
          <div className="cart-footer-copy">
            <Text strong>下单前确认</Text>
            <Text type="secondary">确认选号篮内容后，可复制文本或导出清单图片。</Text>
            {feedback ? <Text className="ticket-feedback">{feedback}</Text> : null}
          </div>
          <Space wrap>
            <Button disabled={rows.length === 0} icon={<Trash2 size={16} />} onClick={onClear}>
              清空
            </Button>
            <Button disabled={rows.length === 0} icon={<CopyIcon size={16} />} onClick={onCopy}>
              复制清单
            </Button>
            <Button
              type="primary"
              disabled={rows.length === 0}
              icon={<ImageDown size={16} />}
              onClick={onExport}
            >
              导出下单图
            </Button>
          </Space>
        </div>
      }
    >
      <Table
        className="data-table"
        rowKey={getTicketRowKey}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 680 }}
        locale={{ emptyText: <Empty description="选号篮为空" /> }}
      />
    </Drawer>
  );
}

function ImagePreviewDrawer({
  preview,
  onClose,
}: {
  preview?: ImagePreview;
  onClose: () => void;
}) {
  return (
    <Drawer
      title={preview?.title ?? '图片预览'}
      open={Boolean(preview)}
      onClose={onClose}
      width={720}
      className="image-preview-drawer"
      footer={
        preview ? (
          <div className="image-preview-footer">
            <Text type="secondary">{preview.filename}</Text>
            <Space wrap>
              <Button
                icon={<ImageDown size={16} />}
                onClick={() => triggerImageDownload(preview)}
              >
                下载图片
              </Button>
              <Button
                type="primary"
                onClick={() => window.open(preview.dataUrl, '_blank', 'noopener,noreferrer')}
              >
                打开图片
              </Button>
            </Space>
          </div>
        ) : null
      }
    >
      {preview ? (
        <div className="image-preview-stage">
          <img src={preview.dataUrl} alt={preview.title} />
        </div>
      ) : null}
    </Drawer>
  );
}

function Metric({
  label,
  value,
  suffix,
  icon,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric-tile">
      <div className="metric-icon">{icon}</div>
      <Statistic title={label} value={value} suffix={suffix} />
    </div>
  );
}

function RuleBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rule-block">
      <Text strong>{title}</Text>
      <div className="rule-content">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TicketTable({
  rows,
  selectedRowKeys,
  selectedCount,
  feedback,
  onSelectionChange,
  onAddSelectedToCart,
  onAddAllToCart,
  onCopySelected,
  onExportSelected,
}: {
  rows: EvaluatedTicket[];
  selectedRowKeys: Key[];
  selectedCount: number;
  feedback?: string;
  onSelectionChange: (keys: Key[]) => void;
  onAddSelectedToCart: () => void;
  onAddAllToCart: () => void;
  onCopySelected: () => void;
  onExportSelected: () => void;
}) {
  const columns: ColumnsType<EvaluatedTicket> = [
    {
      title: '#',
      width: 56,
      render: (_value, _record, index) => <Text type="secondary">{index + 1}</Text>,
    },
    {
      title: '前区',
      dataIndex: ['ticket', 'front'],
      render: (numbers: number[]) => <NumberBalls numbers={numbers} zone="front" />,
    },
    {
      title: '后区',
      dataIndex: ['ticket', 'back'],
      render: (numbers: number[]) => <NumberBalls numbers={numbers} zone="back" />,
    },
    {
      title: '指标',
      render: (_, record) => (
        <Space wrap size={[4, 6]}>
          <Tag>前和 {record.metrics.frontSum}</Tag>
          <Tag>后和 {record.metrics.backSum}</Tag>
          <Tag>{record.metrics.frontOddCount} 奇</Tag>
          <Tag>{record.metrics.frontSmallCount} 小</Tag>
          <Tag>重合 {record.metrics.maxFrontHistoryOverlap}</Tag>
        </Space>
      ),
    },
    {
      title: '规则',
      render: (_, record) => (
        <Space wrap size={[4, 6]}>
          {record.results.map((result) => (
            <Tag key={result.ruleId} color={result.passed ? 'green' : 'red'}>
              {result.label}
            </Tag>
          ))}
        </Space>
      ),
    },
  ];

  return (
    <div className="ticket-table-wrap">
      <div className="ticket-action-bar">
        <div className="ticket-action-copy">
          <Text strong>已选择 {selectedCount} 注</Text>
          <Text type="secondary">勾选候选号码后加入选号篮，最后统一导出</Text>
          {feedback ? <Text className="ticket-feedback">{feedback}</Text> : null}
        </div>
        <Space wrap>
          <Button disabled={rows.length === 0} icon={<Plus size={16} />} onClick={onAddAllToCart}>
            整批加入
          </Button>
          <Button
            type="primary"
            icon={<ShoppingCart size={16} />}
            disabled={selectedCount === 0}
            onClick={onAddSelectedToCart}
          >
            加入选号篮
          </Button>
          <Button
            icon={<CopyIcon size={16} />}
            disabled={selectedCount === 0}
            onClick={onCopySelected}
          >
            复制选号
          </Button>
          <Button
            icon={<ImageDown size={16} />}
            disabled={selectedCount === 0}
            onClick={onExportSelected}
          >
            导出图片
          </Button>
        </Space>
      </div>
      <Table
        className="data-table"
        rowKey={getTicketRowKey}
        rowSelection={{
          selectedRowKeys,
          onChange: onSelectionChange,
        }}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 980 }}
        locale={{ emptyText: <Empty description="暂无候选" /> }}
      />
    </div>
  );
}

function RejectedTable({ rows }: { rows: EvaluatedTicket[] }) {
  const columns: ColumnsType<EvaluatedTicket> = [
    {
      title: '号码',
      render: (_, record) => (
        <Space wrap>
          <NumberBalls numbers={record.ticket.front} zone="front" />
          <NumberBalls numbers={record.ticket.back} zone="back" />
        </Space>
      ),
    },
    {
      title: '首个失败规则',
      render: (_, record) => {
        const failed = record.results.find((result) => !result.passed);

        return failed ? (
          <Space direction="vertical" size={2}>
            <Tag color="red">{failed.label}</Tag>
            <Text type="secondary">{failed.message}</Text>
          </Space>
        ) : (
          <Tag color="green">通过</Tag>
        );
      },
    },
  ];

  return (
    <Table
      className="data-table"
      rowKey={(row) => `${row.ticket.front.join('-')}-${row.ticket.back.join('-')}`}
      columns={columns}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 720 }}
      locale={{ emptyText: <Empty description="暂无排除样例" /> }}
    />
  );
}

function StatsView({
  frontStats,
  backStats,
}: {
  frontStats: NumberStat[];
  backStats: NumberStat[];
}) {
  return (
    <div className="stats-layout">
      <NumberStatGrid title="前区" stats={frontStats} zone="front" />
      <NumberStatGrid title="后区" stats={backStats} zone="back" />
    </div>
  );
}

function NumberStatGrid({
  title,
  stats,
  zone,
}: {
  title: string;
  stats: NumberStat[];
  zone: 'front' | 'back';
}) {
  return (
    <section className="stat-block">
      <div className="stat-block-title">{title}</div>
      <div className="stat-grid">
        {stats.map((stat) => (
          <Tooltip
            key={stat.number}
            title={`出现 ${stat.count} 次，遗漏 ${stat.omission} 期，近期开出 ${stat.recentCount} 次`}
          >
            <div className={`stat-cell ${zone} ${stat.heat}`}>
              <span>{formatNumber(stat.number)}</span>
              <small>{stat.count}</small>
            </div>
          </Tooltip>
        ))}
      </div>
    </section>
  );
}

function HistoryTable({ draws }: { draws: DltDraw[] }) {
  const columns: ColumnsType<DltDraw> = [
    { title: '期号', dataIndex: 'issue' },
    { title: '日期', dataIndex: 'date' },
    {
      title: '前区',
      dataIndex: 'front',
      render: (numbers: number[]) => <NumberBalls numbers={numbers} zone="front" />,
    },
    {
      title: '后区',
      dataIndex: 'back',
      render: (numbers: number[]) => <NumberBalls numbers={numbers} zone="back" />,
    },
    {
      title: '销量',
      dataIndex: 'saleAmount',
      render: (value?: string) => value || '-',
    },
    {
      title: '奖池',
      dataIndex: 'poolBalance',
      render: (value?: string) => value || '-',
    },
    {
      title: '公告',
      dataIndex: 'drawPdfUrl',
      render: (value?: string) =>
        value ? (
          <a href={value} target="_blank" rel="noreferrer">
            PDF
          </a>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <Table
      className="data-table"
      rowKey="issue"
      columns={columns}
      dataSource={draws}
      pagination={{ pageSize: 8 }}
      scroll={{ x: 980 }}
    />
  );
}

function getTicketRowKey(row: EvaluatedTicket) {
  return ticketKey(row.ticket);
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the textarea path below when clipboard permissions are blocked.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('copy failed');
  }
}

function formatTicketList(rows: EvaluatedTicket[]) {
  return rows.map((row, index) => `${index + 1}. ${formatTicket(row.ticket)}`).join('\n');
}

type TicketImageOptions = {
  filenamePrefix?: string;
  subtitle?: string;
  title?: string;
};

function exportTicketsImage(rows: EvaluatedTicket[], options: TicketImageOptions = {}): ImagePreview {
  const width = 920;
  const rowHeight = 72;
  const height = 128 + rows.length * rowHeight + 28;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('canvas unavailable');
  }

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.scale(ratio, ratio);

  drawImageBackground(context, width, height);
  drawExportHeader(context, rows.length, options);

  rows.forEach((row, index) => {
    const y = 106 + index * rowHeight;
    drawTicketImageRow(context, row, index + 1, y);
  });

  return {
    dataUrl: canvas.toDataURL('image/png'),
    filename: `${options.filenamePrefix ?? '乐筛候选号码'}-${formatDateForFileName(new Date())}.png`,
    title: options.title ?? '乐筛候选号码',
  };
}

function drawImageBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = '#f5f1eb';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(17, 24, 39, 0.08)';

  for (let x = 0; x <= width; x += 36) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let y = 0; y <= height; y += 36) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  roundRect(context, 24, 24, width - 48, height - 48, 18);
  context.fillStyle = 'rgba(255, 255, 255, 0.92)';
  context.fill();
  context.strokeStyle = 'rgba(17, 24, 39, 0.14)';
  context.stroke();
}

function drawExportHeader(
  context: CanvasRenderingContext2D,
  count: number,
  options: TicketImageOptions,
) {
  context.fillStyle = '#6f4e37';
  context.font = '700 15px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText('LOTTO SIEVE', 52, 56);
  context.fillStyle = '#111827';
  context.font = '900 34px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText(options.title ?? '乐筛候选号码', 52, 92);
  context.fillStyle = '#475467';
  context.font = '500 14px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText(
    `${options.subtitle ?? '已选择'} ${count} 注 · ${new Date().toLocaleString('zh-CN', {
      hour12: false,
    })}`,
    640,
    62,
  );
  context.fillText('前区 5/35  +  后区 2/12', 640, 88);
}

function drawTicketImageRow(
  context: CanvasRenderingContext2D,
  row: EvaluatedTicket,
  index: number,
  y: number,
) {
  context.strokeStyle = 'rgba(17, 24, 39, 0.08)';
  context.beginPath();
  context.moveTo(52, y - 24);
  context.lineTo(868, y - 24);
  context.stroke();

  drawExportIndexLabel(context, 56, y, index);

  row.ticket.front.forEach((number, numberIndex) => {
    drawExportBall(context, 154 + numberIndex * 44, y, formatNumber(number), '#b42318');
  });

  context.fillStyle = '#98a2b3';
  context.font = '900 22px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText('+', 378, y + 8);

  row.ticket.back.forEach((number, numberIndex) => {
    drawExportBall(context, 424 + numberIndex * 44, y, formatNumber(number), '#0f6cbd');
  });

  context.fillStyle = '#344054';
  context.font = '700 14px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.fillText(
    `前和 ${row.metrics.frontSum}  后和 ${row.metrics.backSum}`,
    548,
    y - 8,
  );
  context.fillText(
    `${row.metrics.frontOddCount} 奇 ${row.metrics.frontEvenCount} 偶 · ${row.metrics.frontSmallCount} 小 ${row.metrics.frontBigCount} 大`,
    548,
    y + 14,
  );
}

function drawExportIndexLabel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  index: number,
) {
  roundRect(context, x, y - 16, 68, 32, 16);
  context.fillStyle = '#f2f4f7';
  context.fill();
  context.strokeStyle = 'rgba(17, 24, 39, 0.1)';
  context.stroke();
  context.fillStyle = '#667085';
  context.font = '700 13px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`第 ${index} 注`, x + 34, y + 1);
  context.textAlign = 'start';
  context.textBaseline = 'alphabetic';
}

function drawExportBall(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  color: string,
) {
  context.save();
  context.shadowColor = 'rgba(17, 24, 39, 0.16)';
  context.shadowBlur = 6;
  context.shadowOffsetY = 2;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, 17, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.fillStyle = '#fff';
  context.font = '900 14px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, x, y + 1);
  context.textAlign = 'start';
  context.textBaseline = 'alphabetic';
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function triggerImageDownload(image: Pick<ImagePreview, 'dataUrl' | 'filename'>) {
  const link = document.createElement('a');
  link.href = image.dataUrl;
  link.download = image.filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatDateForFileName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function NumberBalls({ numbers, zone }: { numbers: number[]; zone: 'front' | 'back' }) {
  return (
    <span className="ball-row">
      {numbers.map((number) => (
        <span key={number} className={`number-ball ${zone}`}>
          {formatNumber(number)}
        </span>
      ))}
    </span>
  );
}
