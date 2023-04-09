import path from "path";
import { Buffer } from "buffer";

import { bodyToBuffer, getAuthHeader, isWriteable } from "./util.js";

// interface LFSInfoResponse {
//   objects: {
//     actions: {
//       download: {
//         href: string;
//         header?: Record<string, string>;
//       };
//     };
//   }[];
// }

// @param {object} val
// @returns bool
function isValidLFSInfoResponseData(val) {
  return val.objects?.[0]?.actions?.download?.href?.trim !== undefined;
}

async function mkdir(fs, objectPath) {
  const pathElements = objectPath.replace(/^\//, '').split('/');

  pathElements.pop();

  let root = '';

  for (let i = 0; i < pathElements.length; i += 1) {
    const pathElement = pathElements[i];

    root += '/';

    const files = await fs.readdir(root);

    if (!files.includes(pathElement)) {
      await fs.mkdir(`${root}/${pathElement}`);
    }

    root += pathElement;
  }
}

/**
 * Downloads, caches and returns a blob corresponding to given LFS pointer.
 * Uses already cached object, if size matches.
 */
// @param {object} val
// @returns {Buffer}
// { promises: fs }: PromiseFsClient,
// { http: { request }, headers = {}, url, auth }: HTTPRequest,
// { info, objectPath }: Pointer
export default async function downloadBlobFromPointer(
  { promises: fs },
  { http: { request }, headers = {}, url, auth },
  { info, objectPath }
) {
  try {
    const cached = await fs.readFile(objectPath);
    if (cached.byteLength === info.size) {
      return cached;
    }
  } catch (e) {
    // Silence file not found errors (implies cache miss)
    if (e.code !== "ENOENT") {
      throw e;
    }
  }

  const authHeaders = auth ? getAuthHeader(auth) : {};

  // Request LFS transfer

  const lfsInfoRequestData = {
    operation: "download",
    transfers: ["basic"],
    objects: [info],
  };

  const { body: lfsInfoBody } = await request({
    url: `${url}/info/lfs/objects/batch`,
    method: "POST",
    headers: {
      // Github LFS doesn’t seem to accept this UA, but works fine without any
      // 'User-Agent': `git/isomorphic-git@${git.version()}`,
      ...headers,
      ...authHeaders,
      Accept: "application/vnd.git-lfs+json",
      "Content-Type": "application/vnd.git-lfs+json",
    },
    body: [Buffer.from(JSON.stringify(lfsInfoRequestData))],
  });

  const lfsInfoResponseRaw = (await bodyToBuffer(lfsInfoBody)).toString();
  let lfsInfoResponseData;
  try {
    lfsInfoResponseData = JSON.parse(lfsInfoResponseRaw);
  } catch (e) {
    throw new Error(
      `Unexpected structure received from LFS server: unable to parse JSON ${lfsInfoResponseRaw}`
    );
  }

  if (isValidLFSInfoResponseData(lfsInfoResponseData)) {
    // Request the actual blob

    const downloadAction = lfsInfoResponseData.objects[0].actions.download;
    const lfsObjectDownloadURL = downloadAction.href;
    const lfsObjectDownloadHeaders = downloadAction.header ?? {};

    const dlHeaders = {
      ...headers,
      ...authHeaders,
      ...lfsObjectDownloadHeaders,
    };

    const { body: lfsObjectBody } = await request({
      url: lfsObjectDownloadURL,
      method: "GET",
      headers: dlHeaders,
    });

    const blob = await bodyToBuffer(lfsObjectBody);

    // Write LFS cache for this object, if cache path is accessible.
    if (await isWriteable({ promises: fs }, objectPath)) {

      // custom recursive mkdir function
      // because LightiningFS fails on fs.mkdir({recursive: true})
      await mkdir(fs, objectPath)

      await fs.writeFile(objectPath, blob);
    }

    return blob;
  } else {
    throw new Error(
      "Unexpected JSON structure received for LFS download request"
    );
  }
}
