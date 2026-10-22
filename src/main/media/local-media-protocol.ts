import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { MediaTokenMap } from './media-token-map';

export const LOCAL_MEDIA_SCHEME = 'tajtlisha-media';

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_MEDIA_SCHEME,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

export type LocalMediaProtocol = {
  /** Must run once, after app ready and before any URL is handed to a renderer. */
  register(): Promise<void>;
  createVideoUrl(inputPath: string): string;
  revoke(inputPath: string): void;
};

export function createLocalMediaProtocol(): LocalMediaProtocol {
  const tokens = new MediaTokenMap();

  return {
    register: async () => {
      protocol.handle(LOCAL_MEDIA_SCHEME, async (request) => {
        const requestUrl = new URL(request.url);
        const token = requestUrl.pathname.slice(1);
        const inputPath = tokens.pathFor(token);

        if (requestUrl.hostname !== 'video' || inputPath === undefined) {
          return new Response('Media not found.', { status: 404 });
        }

        // net.fetch on a file: URL keeps range requests working for seeking.
        const response = await net.fetch(pathToFileURL(inputPath).toString(), {
          headers: request.headers
        });
        const headers = new Headers(response.headers);
        if (!headers.has('content-type')) {
          headers.set('content-type', 'video/mp4');
        }

        return new Response(response.body, {
          headers,
          status: response.status,
          statusText: response.statusText
        });
      });
    },
    createVideoUrl: (inputPath) => `${LOCAL_MEDIA_SCHEME}://video/${tokens.tokenFor(inputPath)}`,
    revoke: (inputPath) => tokens.revoke(inputPath)
  };
}
