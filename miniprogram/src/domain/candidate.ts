import {
  DLT_BACK_COUNT,
  DLT_BACK_MAX,
  DLT_FRONT_COUNT,
  DLT_FRONT_MAX,
  DltDraw,
  DltTicket,
  EvaluatedTicket,
  RuleConfig,
  normalizeNumberList,
  range,
  ticketKey,
  toBackNumbers,
  toFrontNumbers,
} from './dlt';
import { createRuleContext, evaluateTicket, getConfigProblems } from './rules';

export type GenerationOptions = {
  targetCount: number;
  maxAttempts: number;
};

export type GenerationResult = {
  accepted: EvaluatedTicket[];
  rejectedSamples: EvaluatedTicket[];
  attempts: number;
  problems: string[];
};

export function generateTickets(
  draws: DltDraw[],
  config: RuleConfig,
  options: GenerationOptions,
): GenerationResult {
  const problems = getConfigProblems(config);

  if (problems.length > 0) {
    return { accepted: [], rejectedSamples: [], attempts: 0, problems };
  }

  const context = createRuleContext(draws, config);
  const accepted: EvaluatedTicket[] = [];
  const rejectedSamples: EvaluatedTicket[] = [];
  const seen = new Set<string>();
  let attempts = 0;

  while (accepted.length < options.targetCount && attempts < options.maxAttempts) {
    attempts += 1;
    const ticket = createRandomTicket(config);

    if (!ticket) {
      return {
        accepted,
        rejectedSamples,
        attempts,
        problems: ['当前胆码和排除号无法组成有效号码'],
      };
    }

    const key = ticketKey(ticket);
    if (seen.has(key)) continue;
    seen.add(key);

    const evaluated = evaluateTicket(ticket, config, context);
    if (evaluated.passed) {
      accepted.push(evaluated);
    } else if (rejectedSamples.length < 10) {
      rejectedSamples.push(evaluated);
    }
  }

  return {
    accepted,
    rejectedSamples,
    attempts,
    problems: accepted.length < options.targetCount ? ['规则较严，候选数量未达到目标'] : [],
  };
}

function createRandomTicket(config: RuleConfig): DltTicket | null {
  const front = completeNumbers({
    max: DLT_FRONT_MAX,
    count: DLT_FRONT_COUNT,
    required: config.requiredFront,
    excluded: config.excludedFront,
  });
  const back = completeNumbers({
    max: DLT_BACK_MAX,
    count: DLT_BACK_COUNT,
    required: config.requiredBack,
    excluded: config.excludedBack,
  });

  if (!front || !back) return null;

  return {
    front: toFrontNumbers(front),
    back: toBackNumbers(back),
  };
}

function completeNumbers({
  max,
  count,
  required,
  excluded,
}: {
  max: number;
  count: number;
  required: number[];
  excluded: number[];
}) {
  const requiredNumbers = normalizeNumberList(required, max);
  const excludedNumbers = normalizeNumberList(excluded, max);
  const excludedSet = new Set(excludedNumbers);
  const requiredSet = new Set(requiredNumbers);

  if (requiredNumbers.length > count) return null;
  if (requiredNumbers.some((number) => excludedSet.has(number))) return null;

  const pool = shuffle(
    range(1, max).filter((number) => !excludedSet.has(number) && !requiredSet.has(number)),
  );
  const neededCount = count - requiredNumbers.length;

  if (pool.length < neededCount) return null;

  return [...requiredNumbers, ...pool.slice(0, neededCount)].sort((left, right) => left - right);
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}
