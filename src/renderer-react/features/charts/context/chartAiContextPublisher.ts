import type { WesternChartAiContext } from '../../../api/contracts';

type Sender = (context: WesternChartAiContext | null) => Promise<unknown>;
type Status = (error: unknown | null) => void;
interface PublicationIntent {
  owner: symbol;
  isActive: boolean;
  context: WesternChartAiContext | null;
  send: Sender;
  status: Status;
}

let generation = 0;
let activeOwner: symbol | null = null;
let ownerIsActive = false;
let queue: Promise<void> = Promise.resolve();
let latestIntent: PublicationIntent | null = null;

function enqueue(owner: symbol, isActive: boolean, context: WesternChartAiContext | null, send: Sender, status: Status): void {
  latestIntent = { owner, isActive, context, send, status };
  const currentGeneration = ++generation;
  activeOwner = owner;
  ownerIsActive = isActive;
  queue = queue.catch(() => undefined).then(async () => {
    if (currentGeneration !== generation || activeOwner !== owner || ownerIsActive !== isActive) return;
    const attempts = !isActive && context === null ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (currentGeneration !== generation || activeOwner !== owner || ownerIsActive !== isActive) return;
      try {
        await send(context);
        if (currentGeneration === generation && activeOwner === owner && ownerIsActive === isActive) status(null);
        return;
      } catch (error) {
        if (currentGeneration !== generation || activeOwner !== owner || ownerIsActive !== isActive) return;
        if (attempt === attempts - 1) status(error);
      }
    }
  });
}

export function publishLatestChartAiContext(owner: symbol, context: WesternChartAiContext | null, send: Sender, status: Status): void {
  enqueue(owner, true, context, send, status);
}

export function deactivateChartAiContextOwner(owner: symbol, send: Sender, status: Status): boolean {
  if (activeOwner !== owner) return false;
  enqueue(owner, false, null, send, status);
  return true;
}

export function retryLatestChartAiContext(): boolean {
  if (!latestIntent) return false;
  enqueue(latestIntent.owner, latestIntent.isActive, latestIntent.context, latestIntent.send, latestIntent.status);
  return true;
}

export function resetChartAiContextPublisherForTests(): void {
  generation = 0;
  activeOwner = null;
  ownerIsActive = false;
  queue = Promise.resolve();
  latestIntent = null;
}
