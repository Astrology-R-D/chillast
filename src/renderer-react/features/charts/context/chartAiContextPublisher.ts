import type { WesternChartAiContext } from '../../../api/contracts';

type Sender = (context: WesternChartAiContext | null) => Promise<unknown>;
type Status = (error: unknown | null) => void;

let generation = 0;
let activeOwner: symbol | null = null;
let queue: Promise<void> = Promise.resolve();

export function publishLatestChartAiContext(owner: symbol, context: WesternChartAiContext | null, send: Sender, status: Status): void {
  const currentGeneration = ++generation;
  activeOwner = owner;
  queue = queue.catch(() => undefined).then(async () => {
    if (currentGeneration !== generation || activeOwner !== owner) return;
    try {
      await send(context);
      if (currentGeneration === generation && activeOwner === owner) status(null);
    } catch (error) {
      if (currentGeneration === generation && activeOwner === owner) status(error);
    }
  });
}

export function invalidateChartAiContextOwner(owner: symbol): void {
  if (activeOwner !== owner) return;
  activeOwner = null;
  generation += 1;
}

export function resetChartAiContextPublisherForTests(): void {
  generation = 0;
  activeOwner = null;
  queue = Promise.resolve();
}
