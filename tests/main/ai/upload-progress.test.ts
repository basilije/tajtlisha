import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { byteCounter } from '../../../src/main/ai/opus-provider';

describe('byteCounter', () => {
  it('reports how many bytes have been read', async () => {
    const seen: number[] = [];
    const chunks: Buffer[] = [];
    const counter = byteCounter((loaded) => seen.push(loaded));
    const source = Readable.from([Buffer.from('abcd'), Buffer.from('ef')]);

    await new Promise<void>((resolve, reject) => {
      source.pipe(counter);
      counter.on('data', (chunk: Buffer) => chunks.push(chunk));
      counter.on('end', () => resolve());
      counter.on('error', reject);
    });

    expect(Buffer.concat(chunks).toString()).toBe('abcdef');
    expect(seen).toEqual([4, 6]);
  });
});
