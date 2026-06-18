// ChartView.js — the personal-chart workspace (natal, transit, progressed,
// solar/lunar return). A thin specialisation of the shared workbench.

import { ChartWorkbenchView } from './ChartWorkbenchView.js';

export class ChartView extends ChartWorkbenchView {
  constructor(context) {
    super(context, 'personal');
  }
}
