import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  ConfigProvider,
  Drawer,
  Empty,
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
  Database,
  Filter,
  HelpCircle,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
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
  range,
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
  const [result, setResult] = useState(() =>
    generateTickets(initialData.draws, DEFAULT_RULE_CONFIG, {
      targetCount: 10,
      maxAttempts: 100000,
    }),
  );
  const draws = dataState.draws;
  const dataInfo = dataState.info;

  const stats = useMemo(
    () => buildDltStats(draws, config.recentWindow),
    [draws, config.recentWindow],
  );

  const updateConfig = <Key extends keyof RuleConfig>(key: Key, value: RuleConfig[Key]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const handleGenerate = () => {
    const nextResult = generateTickets(draws, config, {
      targetCount,
      maxAttempts,
    });
    setResult(nextResult);
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
            <Button type="primary" icon={<Play size={16} />} onClick={handleGenerate}>
              生成候选
            </Button>
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
          </aside>

          <section className="result-panel">
            <Tabs
              items={[
                {
                  key: 'accepted',
                  label: `候选结果 ${result.accepted.length}`,
                  children: <TicketTable rows={result.accepted} />,
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
                <li>点击“生成候选”，系统会随机生成号码并逐条筛选。</li>
                <li>在右侧查看候选结果、排除样例、号码统计和历史数据。</li>
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
                <dd>展示通过全部规则的号码组合和关键指标。</dd>
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

function TicketTable({ rows }: { rows: EvaluatedTicket[] }) {
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
    <Table
      className="data-table"
      rowKey={(row) => `${row.ticket.front.join('-')}-${row.ticket.back.join('-')}`}
      columns={columns}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 920 }}
      locale={{ emptyText: <Empty description="暂无候选" /> }}
    />
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
