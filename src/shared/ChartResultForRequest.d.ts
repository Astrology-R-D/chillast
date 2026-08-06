export function validateChartResultForRequestCore<T>(
  result: T,
  request: { type: string; settings: { houseSystem: string; zodiac: string } },
  expectedRingsByType: Readonly<Record<string, readonly { id: string; role: string }[]>>,
  expectedSubjects: number,
): T;
