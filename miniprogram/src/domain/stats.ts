import {
  DltDraw,
  DltTicket,
  DltTicketMetrics,
  countConsecutiveGroups,
  overlapCount,
  sum,
} from './dlt';

export type NumberStat = {
  number: number;
  count: number;
  recentCount: number;
  omission: number;
};

export type DltStats = {
  totalDraws: number;
  latestIssue?: string;
  latestDate?: string;
  frontStats: NumberStat[];
  backStats: NumberStat[];
  recentFrontNumbers: Set<number>;
  recentBackNumbers: Set<number>;
};

export function sortDrawsByLatest(draws: DltDraw[]) {
  return [...draws].sort((left, right) => {
    const dateSort = right.date.localeCompare(left.date);
    return dateSort === 0 ? right.issue.localeCompare(left.issue) : dateSort;
  });
}

export function buildDltStats(draws: DltDraw[], recentWindow: number): DltStats {
  const orderedDraws = sortDrawsByLatest(draws);
  const recentDraws = orderedDraws.slice(0, recentWindow);
  const recentFrontNumbers = new Set(recentDraws.flatMap((draw) => draw.front));
  const recentBackNumbers = new Set(recentDraws.flatMap((draw) => draw.back));

  return {
    totalDraws: orderedDraws.length,
    latestIssue: orderedDraws[0]?.issue,
    latestDate: orderedDraws[0]?.date,
    frontStats: buildNumberStats(35, orderedDraws, recentDraws, 'front'),
    backStats: buildNumberStats(12, orderedDraws, recentDraws, 'back'),
    recentFrontNumbers,
    recentBackNumbers,
  };
}

export function calculateTicketMetrics(
  ticket: DltTicket,
  draws: DltDraw[],
  recentFrontNumbers: Set<number>,
  recentBackNumbers: Set<number>,
): DltTicketMetrics {
  const frontOddCount = ticket.front.filter((number) => number % 2 === 1).length;
  const frontSmallCount = ticket.front.filter((number) => number <= 17).length;

  return {
    frontSum: sum(ticket.front),
    backSum: sum(ticket.back),
    frontOddCount,
    frontEvenCount: ticket.front.length - frontOddCount,
    frontSmallCount,
    frontBigCount: ticket.front.length - frontSmallCount,
    consecutiveGroups: countConsecutiveGroups(ticket.front),
    maxFrontHistoryOverlap: getMaxOverlap(ticket.front, draws.map((draw) => draw.front)),
    recentFrontCount: ticket.front.filter((number) => recentFrontNumbers.has(number)).length,
    recentBackCount: ticket.back.filter((number) => recentBackNumbers.has(number)).length,
  };
}

function buildNumberStats(
  max: number,
  draws: DltDraw[],
  recentDraws: DltDraw[],
  zone: 'front' | 'back',
) {
  return Array.from({ length: max }, (_, index) => index + 1).map((number) => {
    const count = draws.filter((draw) => draw[zone].includes(number)).length;
    const recentCount = recentDraws.filter((draw) => draw[zone].includes(number)).length;
    const lastIndex = draws.findIndex((draw) => draw[zone].includes(number));

    return {
      number,
      count,
      recentCount,
      omission: lastIndex >= 0 ? lastIndex : draws.length,
    };
  });
}

function getMaxOverlap(numbers: number[], history: number[][]) {
  if (history.length === 0) {
    return 0;
  }

  return Math.max(...history.map((drawNumbers) => overlapCount(numbers, drawNumbers)));
}
