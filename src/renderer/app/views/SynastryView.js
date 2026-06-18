// SynastryView.js — the relationship workspace (synastry, composite, davison).
// A thin specialisation of the shared workbench configured for two subjects.

import { ChartWorkbenchView } from './ChartWorkbenchView.js';

export class SynastryView extends ChartWorkbenchView {
  constructor(context) {
    super(context, 'relationship');
  }
}
