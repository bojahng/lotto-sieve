import {
  DLT_BACK_COUNT,
  DLT_BACK_MAX,
  DLT_FRONT_COUNT,
  DLT_FRONT_MAX,
  DltDraw,
  DltTicket,
  DltTicketMetrics,
  EvaluatedTicket,
  RuleConfig,
  RuleResult,
  normalizeNumberList,
} from './dlt';
import { DltStats, buildDltStats, calculateTicketMetrics } from './stats';

export type DltRuleContext = {
  draws: DltDraw[];
  stats: DltStats;
};

type DltRuleEvaluateContext = DltRuleContext & {
  metrics: DltTicketMetrics;
};

type DltRule = {
  id: string;
  label: string;
  evaluate: (ticket: DltTicket, config: RuleConfig, context: DltRuleEvaluateContext) => RuleResult;
};

export function createRuleContext(draws: DltDraw[], config: RuleConfig): DltRuleContext {
  return {
    draws,
    stats: buildDltStats(draws, config.recentWindow),
  };
}

export function evaluateTicket(
  ticket: DltTicket,
  config: RuleConfig,
  context: DltRuleContext,
): EvaluatedTicket {
  const metrics = calculateTicketMetrics(
    ticket,
    context.draws,
    context.stats.recentFrontNumbers,
    context.stats.recentBackNumbers,
  );
  const metricContext = { ...context, metrics };
  const results = rules.map((rule) => rule.evaluate(ticket, config, metricContext));

  return {
    ticket,
    metrics,
    results,
    passed: results.every((result) => result.passed),
  };
}

export function getConfigProblems(config: RuleConfig) {
  const problems: string[] = [];
  const requiredFront = normalizeNumberList(config.requiredFront, DLT_FRONT_MAX);
  const excludedFront = normalizeNumberList(config.excludedFront, DLT_FRONT_MAX);
  const requiredBack = normalizeNumberList(config.requiredBack, DLT_BACK_MAX);
  const excludedBack = normalizeNumberList(config.excludedBack, DLT_BACK_MAX);

  if (requiredFront.length > DLT_FRONT_COUNT) problems.push('前区胆码不能超过 5 个');
  if (requiredBack.length > DLT_BACK_COUNT) problems.push('后区胆码不能超过 2 个');

  const frontConflicts = requiredFront.filter((number) => excludedFront.includes(number));
  const backConflicts = requiredBack.filter((number) => excludedBack.includes(number));

  if (frontConflicts.length > 0) {
    problems.push(`前区 ${frontConflicts.join(', ')} 同时出现在胆码和排除号`);
  }

  if (backConflicts.length > 0) {
    problems.push(`后区 ${backConflicts.join(', ')} 同时出现在胆码和排除号`);
  }

  if (DLT_FRONT_MAX - excludedFront.length < DLT_FRONT_COUNT) problems.push('前区排除号过多');
  if (DLT_BACK_MAX - excludedBack.length < DLT_BACK_COUNT) problems.push('后区排除号过多');
  if (config.allowedFrontOddCounts.length === 0) problems.push('至少保留一种前区奇偶结构');
  if (config.allowedFrontSmallCounts.length === 0) problems.push('至少保留一种前区大小结构');

  return problems;
}

const rules: DltRule[] = [
  {
    id: 'manual-front',
    label: '前区手动号',
    evaluate: (ticket, config) => {
      const missing = config.requiredFront.filter((number) => !ticket.front.includes(number));
      const excluded = ticket.front.filter((number) => config.excludedFront.includes(number));
      const passed = missing.length === 0 && excluded.length === 0;

      return {
        ruleId: 'manual-front',
        label: '前区手动号',
        passed,
        message: passed
          ? '前区胆码和排除号通过'
          : `缺少 ${missing.join(', ') || '-'}，包含排除号 ${excluded.join(', ') || '-'}`,
      };
    },
  },
  {
    id: 'manual-back',
    label: '后区手动号',
    evaluate: (ticket, config) => {
      const missing = config.requiredBack.filter((number) => !ticket.back.includes(number));
      const excluded = ticket.back.filter((number) => config.excludedBack.includes(number));
      const passed = missing.length === 0 && excluded.length === 0;

      return {
        ruleId: 'manual-back',
        label: '后区手动号',
        passed,
        message: passed
          ? '后区胆码和排除号通过'
          : `缺少 ${missing.join(', ') || '-'}，包含排除号 ${excluded.join(', ') || '-'}`,
      };
    },
  },
  {
    id: 'front-sum',
    label: '前区和值',
    evaluate: (_ticket, config, context) => {
      const [min, max] = config.frontSumRange;
      const passed = context.metrics.frontSum >= min && context.metrics.frontSum <= max;
      return {
        ruleId: 'front-sum',
        label: '前区和值',
        passed,
        message: `前区和值 ${context.metrics.frontSum}，范围 ${min}-${max}`,
      };
    },
  },
  {
    id: 'back-sum',
    label: '后区和值',
    evaluate: (_ticket, config, context) => {
      const [min, max] = config.backSumRange;
      const passed = context.metrics.backSum >= min && context.metrics.backSum <= max;
      return {
        ruleId: 'back-sum',
        label: '后区和值',
        passed,
        message: `后区和值 ${context.metrics.backSum}，范围 ${min}-${max}`,
      };
    },
  },
  {
    id: 'front-odd',
    label: '前区奇偶',
    evaluate: (_ticket, config, context) => ({
      ruleId: 'front-odd',
      label: '前区奇偶',
      passed: config.allowedFrontOddCounts.includes(context.metrics.frontOddCount),
      message: `${context.metrics.frontOddCount} 奇 ${context.metrics.frontEvenCount} 偶`,
    }),
  },
  {
    id: 'front-size',
    label: '前区大小',
    evaluate: (_ticket, config, context) => ({
      ruleId: 'front-size',
      label: '前区大小',
      passed: config.allowedFrontSmallCounts.includes(context.metrics.frontSmallCount),
      message: `${context.metrics.frontSmallCount} 小 ${context.metrics.frontBigCount} 大`,
    }),
  },
  {
    id: 'front-consecutive',
    label: '前区连号',
    evaluate: (_ticket, config, context) => ({
      ruleId: 'front-consecutive',
      label: '前区连号',
      passed: context.metrics.consecutiveGroups <= config.maxConsecutiveGroups,
      message: `${context.metrics.consecutiveGroups} 组连号，上限 ${config.maxConsecutiveGroups}`,
    }),
  },
  {
    id: 'history-overlap',
    label: '历史重合',
    evaluate: (_ticket, config, context) => ({
      ruleId: 'history-overlap',
      label: '历史重合',
      passed: context.metrics.maxFrontHistoryOverlap <= config.maxFrontHistoryOverlap,
      message: `前区最大重合 ${context.metrics.maxFrontHistoryOverlap}，上限 ${config.maxFrontHistoryOverlap}`,
    }),
  },
  {
    id: 'recent-usage',
    label: '近期号码',
    evaluate: (_ticket, config, context) => ({
      ruleId: 'recent-usage',
      label: '近期号码',
      passed:
        context.metrics.recentFrontCount <= config.maxRecentFrontCount &&
        context.metrics.recentBackCount <= config.maxRecentBackCount,
      message: `近 ${config.recentWindow} 期：前区 ${context.metrics.recentFrontCount}，后区 ${context.metrics.recentBackCount}`,
    }),
  },
];
