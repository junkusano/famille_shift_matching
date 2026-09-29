import { AsyncLocalStorage } from "node:async_hooks";

export type AuthMode = "oauth" | "static";

export type Actor = {
  id: string;
  authMode: AuthMode;
  scopes: Set<string>;
};

const actorStorage = new AsyncLocalStorage<Actor>();

export function runAsActor<T>(actor: Actor, callback: () => T): T {
  return actorStorage.run(actor, callback);
}

export function getActor(): Actor | undefined {
  return actorStorage.getStore();
}

export function requireScope(scope: string): Actor {
  const actor = getActor();
  if (!actor) throw new Error("Authenticated actor context is missing");
  if (!actor.scopes.has("*") && !actor.scopes.has(scope)) {
    throw new Error(`Missing required scope: ${scope}`);
  }
  return actor;
}
