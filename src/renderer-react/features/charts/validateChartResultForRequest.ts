import { CHART_DESCRIPTORS } from './catalog';
import type { ChartRequest, ChartType, NormalizedChartResult } from './contracts';
import ringContract from '../../../shared/WesternChartResultRings.json';
import { validateChartResultForRequestCore } from '../../../shared/ChartResultForRequest';

interface ExpectedRing { id: string; role: string }

export const EXPECTED_RINGS_BY_CHART_TYPE = ringContract satisfies Record<ChartType, readonly ExpectedRing[]>;

export function validateChartResultForRequest(
  result: NormalizedChartResult,
  request: ChartRequest,
): NormalizedChartResult {
  const expectedSubjects = CHART_DESCRIPTORS[request.type].route === 'personal' ? 1 : 2;
  return validateChartResultForRequestCore(result, request, EXPECTED_RINGS_BY_CHART_TYPE, expectedSubjects);
}
