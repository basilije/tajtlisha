import { randomUUID } from 'node:crypto';

/**
 * Maps opaque URL tokens to local file paths for the media protocol. One file
 * always gets the same token, so a reloaded video keeps its URL, and several
 * files can be served at once (source video plus preview proxy).
 */
export class MediaTokenMap {
  private readonly tokenByPath = new Map<string, string>();
  private readonly pathByToken = new Map<string, string>();

  constructor(private readonly createToken: () => string = randomUUID) {}

  tokenFor(path: string): string {
    const existing = this.tokenByPath.get(path);
    if (existing !== undefined) return existing;

    const token = this.createToken();
    this.tokenByPath.set(path, token);
    this.pathByToken.set(token, path);
    return token;
  }

  pathFor(token: string): string | undefined {
    return this.pathByToken.get(token);
  }

  /** Forgets the path. Its old token stops resolving, so later requests get 404. */
  revoke(path: string): void {
    const token = this.tokenByPath.get(path);
    if (token === undefined) return;
    this.tokenByPath.delete(path);
    this.pathByToken.delete(token);
  }

  get size(): number {
    return this.pathByToken.size;
  }
}
