import type { SessionEngine } from './engine.js';
import { errorMessage } from '../protocol/json.js';
import { saveSession } from './persistence.js';

/** Startup can be cancelled at every await; local failures are not disconnects. */
export async function launchSession(
  engine: SessionEngine,
  prompt: string,
  cancelled: () => boolean,
  persist: typeof saveSession = saveSession,
): Promise<void> {
  if (cancelled()) return;
  try {
    await engine.start();
  } catch (error) {
    if (!cancelled()) {
      engine.store.notice = errorMessage(error);
      engine.store.connection = 'disconnected';
      engine.store.changed();
    }
    return;
  }
  if (cancelled()) return;
  try {
    await persist(engine.store.rootId, engine.options.cwd);
  } catch (error) {
    engine.store.notice = `Session ID could not be saved: ${errorMessage(error)}. Use /status to copy it.`;
    engine.store.changed();
  }
  if (cancelled() || !prompt) return;
  try {
    await engine.send(engine.store.rootId, prompt);
  } catch (error) {
    if (!cancelled()) {
      engine.store.notice = errorMessage(error);
      engine.store.changed();
    }
  }
}
