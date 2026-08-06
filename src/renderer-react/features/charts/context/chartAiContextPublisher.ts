import type { WesternChartAiContext } from '../../../api/contracts';

type Sender = (context: WesternChartAiContext | null) => Promise<unknown>;
type Status = (error: unknown | null) => void;

let generation = 0;
let activeOwner: symbol | null = null;
let ownerIsActive = false;
let queue: Promise<void> = Promise.resolve();

function enqueue(owner: symbol, isActive: boolean, context: WesternChartAiContext | null, send: Sender, status: Status): void {
  const currentGeneration = ++generation;
  activeOwner = owner;
  ownerIsActive = isActive;
  queue = queue.catch(() => undefined).then(async () => {
    if (currentGeneration !== generation || activeOwner !== owner || ownerIsActive !== isActive) return;
    try {
      await send(context);
      if (currentGeneration === generation && activeOwner === owner && ownerIsActive === isActive) status(null);
    } catch (error) {
      if (currentGeneration === generation && activeOwner === owner && ownerIsActive === isActive) status(error);
    }
  });
}

export function publishLatestChartAiContext(owner: symbol, context: WesternChartAiContext | null, send: Sender, status: Status): void {
  enqueue(owner, true, context, send, status);
}

export function deactivateChartAiContextOwner(owner: symbol, send: Sender, status: Status): void {
  if (activeOwner !== owner) return;
  enqueue(owner, false, null, send, status);
}

export function resetChartAiContextPublisherForTests(): void {
  generation = 0;
  activeOwner = null;
  ownerIsActive = false;
  queue = Promise.resolve();
}
