import {
  DLT_BACK_MAX,
  DLT_FRONT_MAX,
  DltDraw,
  DltTicket,
  DltTicketMetrics,
  countConsecutiveGroups,
  overlapCount,
  range,
  sum,
} from './dlt';

export type HeatLevel = 'hot' | 'warm' | 'cold';

export type NumberStat = {
  number: number;
  count: number;
  recentCount: number;
  omission: number;
  lastIssue?: string;
  heat: HeatLevel;
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

  const frontStats = buildNumberStats(
    range(1, DLT_FRONT_MAX),
    orderedDraws,
    recentDraws,
    'front',
    10,
  );
  const backStats = buildNumberStats(
    range(1, DLT_BACK_MAX),
    orderedDraws,
    recentDraws,
    'back',
    4,
  );

  return {
    totalDraws: orderedDraws.length,
    latestIssue: orderedDraws[0]?.issue,
    latestDate: orderedDraws[0]?.date,
    frontStats,
    backStats,
    recentFrontNumbers,
    recentBackNumbers,
  };
}

function buildNumberStats(
  numbers: number[],
  draws: DltDraw[],
  recentDraws: DltDraw[],
  zone: 'front' | 'back',
  heatBucketSize: number,
) {
  const rawStats = numbers.map((number) => {
    const count = draws.filter((draw) => draw[zone].includes(number)).length;
    const recentCount = recentDraws.filter((draw) => draw[zone].includes(number)).length;
    const lastIndex = draws.findIndex((draw) => draw[zone].includes(number));
    const lastDraw = lastIndex >= 0 ? draws[lastIndex] : undefined;

    return {
      number,
      count,
      recentCount,
      omission: lastIndex >= 0 ? lastIndex : draws.length,
      lastIssue: lastDraw?.issue,
      heat: 'warm' as HeatLevel,
    };
  });

  const countRank = [...rawStats].sort((left, right) => {
    const countSort = right.count - left.count;
    return countSort === 0 ? left.omission - right.omission : countSort;
  });

  const hotNumbers = new Set(countRank.slice(0, heatBucketSize).map((stat) => stat.number));
  const coldNumbers = new Set(
    countRank
      .slice(-heatBucketSize)
      .map((stat) => stat.number),
  );

  return rawStats.map((stat) => {
    const heat: HeatLevel = hotNumbers.has(stat.number)
      ? 'hot'
      : coldNumbers.has(stat.number)
        ? 'cold'
        : 'warm';

    return {
      ...stat,
      heat,
    };
  });
}

export function calculateTicketMetrics(
  ticket: DltTicket,
  draws: DltDraw[],
  recentFrontNumbers: Set<number>,
  recentBackNumbers: Set<number>,
): DltTicketMetrics {
  const frontOddCount = ticket.front.filter((number) => number % 2 === 1).length;
  const backOddCount = ticket.back.filter((number) => number % 2 === 1).length;
  const frontSmallCount = ticket.front.filter((number) => number <= 17).length;

  return {
    frontSum: sum(ticket.front),
    backSum: sum(ticket.back),
    frontOddCount,
    frontEvenCount: ticket.front.length - frontOddCount,
    backOddCount,
    backEvenCount: ticket.back.length - backOddCount,
    frontSmallCount,
    frontBigCount: ticket.front.length - frontSmallCount,
    consecutiveGroups: countConsecutiveGroups(ticket.front),
    maxFrontHistoryOverlap: getMaxOverlap(ticket.front, draws.map((draw) => draw.front)),
    maxBackHistoryOverlap: getMaxOverlap(ticket.back, draws.map((draw) => draw.back)),
    recentFrontCount: ticket.front.filter((number) => recentFrontNumbers.has(number)).length,
    recentBackCount: ticket.back.filter((number) => recentBackNumbers.has(number)).length,
  };
}

function getMaxOverlap(numbers: number[], history: number[][]) {
  if (history.length === 0) {
    return 0;
  }

  return Math.max(...history.map((drawNumbers) => overlapCount(numbers, drawNumbers)));
}
