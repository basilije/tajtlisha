import { spawn } from 'node:child_process';
import { AppError } from '../../shared/errors';

export type RunProcessResult = {
  stdout: string;
  stderr: string;
};

export type RunProcessOptions = {
  timeoutMs?: number;
  /** Aborting kills the process and rejects with AppError('JOB_CANCELED'). */
  signal?: AbortSignal;
  /** Called for every complete stdout line (used for `ffmpeg -progress pipe:1`). */
  onStdoutLine?: (line: string) => void;
};

export function runProcess(command: string, args: string[], options: RunProcessOptions = {}): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new AppError('JOB_CANCELED'));
      return;
    }

    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let pendingLine = '';
    let settled = false;

    const finish = (error: Error | null, result?: RunProcessResult): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(result as RunProcessResult);
    };

    const onAbort = (): void => {
      child.kill('SIGKILL');
      finish(new AppError('JOB_CANCELED'));
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
          finish(new Error(`${command} timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs)
      : undefined;

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      if (options.onStdoutLine) {
        pendingLine += chunk.toString('utf8');
        const lines = pendingLine.split('\n');
        pendingLine = lines.pop() ?? '';
        for (const line of lines) options.onStdoutLine(line.trim());
      }
    });
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish(error.code === 'ENOENT' ? new AppError('FFMPEG_MISSING', `${command} was not found on PATH.`) : error);
    });
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) {
        finish(null, { stdout, stderr });
        return;
      }

      finish(new AppError('FFMPEG_FAILED', `${command} exited with code ${code}: ${tail(stderr || stdout)}`));
    });
  });
}

/** Keeps error messages readable: ffmpeg prints a long banner before the real error. */
function tail(text: string, maxLines = 12): string {
  return text.trim().split('\n').slice(-maxLines).join('\n');
}
