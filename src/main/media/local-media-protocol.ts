import { net, protocol } from 'electron';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const LOCAL_MEDIA_SCHEME = 'tajtlisha-media';

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
  register(): Promise<void>;
  createVideoUrl(inputPath: string): string;
};

export function createLocalMediaProtocol(): LocalMediaProtocol {
  let selectedVideo: { inputPath: string; token: string } | null = null;

  return {
    register: async () => {
      protocol.handle(LOCAL_MEDIA_SCHEME, async (request) => {
        const requestUrl = new URL(request.url);
        const token = requestUrl.pathname.slice(1);

        if (requestUrl.hostname !== 'video' || !selectedVideo || token !== selectedVideo.token) {
          return new Response('Media not found.', { status: 404 });
        }

        const response = await net.fetch(pathToFileURL(selectedVideo.inputPath).toString(), {
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
    createVideoUrl: (inputPath) => {
      const token = randomUUID();
      selectedVideo = { inputPath, token };
      return `${LOCAL_MEDIA_SCHEME}://video/${token}`;
    }
  };
}
