declare module '*renderer/app/components/ChartWheel.js' {
  import type { AppChartConfig } from '../api/contracts';
  import type { ChartReferenceData, NormalizedChartResult } from '../features/charts/contracts';

  export class ChartWheel {
    constructor(reference: ChartReferenceData & { _wheelLocale?: Record<string, string> }, chartConfig?: AppChartConfig);
    toSvg(chart: NormalizedChartResult): string;
  }

  export function spreadAngles(longitudes: number[], minSep: number): number[];
  export function midLongitude(left: number, right: number): number;
}
