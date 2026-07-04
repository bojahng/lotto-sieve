export type FrontNumbers = [number, number, number, number, number];
export type BackNumbers = [number, number];

export type DltDraw = {
  issue: string;
  date: string;
  front: FrontNumbers;
  back: BackNumbers;
  saleAmount?: string;
  poolBalance?: string;
};

export type DltTicket = {
  front: FrontNumbers;
  back: BackNumbers;
};

export type DltTicketMetrics = {
  frontSum: number;
  backSum: number;
  frontOddCount: number;
  frontEvenCount: number;
  frontSmallCount: number;
  frontBigCount: number;
  consecutiveGroups: number;
  maxFrontHistoryOverlap: number;
  recentFrontCount: number;
  recentBackCount: number;
};

export type RuleConfig = {
  frontSumRange: [number, number];
  backSumRange: [number, number];
  allowedFrontOddCounts: number[];
  allowedFrontSmallCounts: number[];
  maxConsecutiveGroups: number;
  maxFrontHistoryOverlap: number;
  recentWindow: number;
  maxRecentFrontCount: number;
  maxRecentBackCount: number;
  requiredFront: number[];
  excludedFront: number[];
  requiredBack: number[];
  excludedBack: number[];
};

export type RuleResult = {
  ruleId: string;
  label: string;
  passed: boolean;
  message: string;
};

export type EvaluatedTicket = {
  ticket: DltTicket;
  passed: boolean;
  results: RuleResult[];
  metrics: DltTicketMetrics;
};

export const DLT_FRONT_MAX = 35;
export const DLT_BACK_MAX = 12;
export const DLT_FRONT_COUNT = 5;
export const DLT_BACK_COUNT = 2;

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  frontSumRange: [70, 130],
  backSumRange: [6, 18],
  allowedFrontOddCounts: [2, 3],
  allowedFrontSmallCounts: [2, 3],
  maxConsecutiveGroups: 1,
  maxFrontHistoryOverlap: 3,
  recentWindow: 10,
  maxRecentFrontCount: 3,
  maxRecentBackCount: 1,
  requiredFront: [],
  excludedFront: [],
  requiredBack: [],
  excludedBack: [],
};

export function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function sortNumbers<T extends number[]>(numbers: T): T {
  return [...numbers].sort((left, right) => left - right) as T;
}

export function normalizeNumberList(values: number[], max: number) {
  return [...new Set(values)]
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= max)
    .sort((left, right) => left - right);
}

export function toFrontNumbers(values: number[]): FrontNumbers {
  return sortNumbers(values) as FrontNumbers;
}

export function toBackNumbers(values: number[]): BackNumbers {
  return sortNumbers(values) as BackNumbers;
}

export function sum(numbers: number[]) {
  return numbers.reduce((total, value) => total + value, 0);
}

export function overlapCount(left: number[], right: number[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).length;
}

export function countConsecutiveGroups(numbers: number[]) {
  const sorted = sortNumbers(numbers);
  let groups = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const startsGroup =
      sorted[index] === sorted[index - 1] + 1 &&
      (index === 1 || sorted[index - 1] !== sorted[index - 2] + 1);

    if (startsGroup) {
      groups += 1;
    }
  }

  return groups;
}

export function ticketKey(ticket: DltTicket) {
  return `${ticket.front.join(',')}|${ticket.back.join(',')}`;
}

export function formatNumber(value: number) {
  return value.toString().padStart(2, '0');
}

export function formatTicket(ticket: DltTicket) {
  return `${ticket.front.map(formatNumber).join(' ')} + ${ticket.back
    .map(formatNumber)
    .join(' ')}`;
}
