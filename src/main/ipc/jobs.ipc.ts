import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { JobRegistry } from '../jobs/job-registry';
import { requireJobId } from './validation';
import type { IpcRegistrar } from './types';

export type JobsIpcDeps = {
  ipc: IpcRegistrar;
  jobs: Pick<JobRegistry, 'cancel'>;
};

/** Progress events are pushed by JobRegistry on jobs:progress; this module only handles cancel. */
export function registerJobsIpc({ ipc, jobs }: JobsIpcDeps): void {
  ipc.handle(IPC_CHANNELS.jobsCancel, (event, jobId: unknown) => jobs.cancel(requireJobId(jobId), event.sender.id));
}
