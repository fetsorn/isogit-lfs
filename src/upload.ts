import { Buffer } from "buffer";

import { HTTPRequest } from "./types";
import { buildPointerInfo, PointerInfo } from "./pointers";
import { getAuthHeader } from "./util";

interface LFSInfoResponse {
  objects: {
    actions?: {
      upload: {
        href: string;
        header?: Record<string, string>;
      };
      verify?: {
        href: string;
        header?: Record<string, string>;
      };
    };
  }[];
}

function isValidLFSInfoResponseData(
  val: Record<string, any>
): val is LFSInfoResponse {
  const obj = val.objects?.[0];
  return obj && (!obj.actions || obj.actions.upload.href.trim !== undefined);
}

/**
 * Given a blob, uploads the blob to LFS server and returns a PointerInfo,
 * which the caller can then combine with object path into a Pointer
 * and commit in place of the original Git blob.
 */
export default async function uploadBlobs(
  { headers = {}, url, auth }: HTTPRequest,
  contents: Buffer[]
): Promise<PointerInfo[]> {
  const infos = await Promise.all(contents.map((c) => buildPointerInfo(c)));

  const authHeaders: Record<string, string> = auth ? getAuthHeader(auth) : {};

  // Request LFS transfer
  const lfsInfoRequestData = {
    operation: "upload",
    transfers: ["basic"],
    objects: infos,
  };

  const lfsInfoRes = await fetch(`${url}/info/lfs/objects/batch`, {
    method: "POST",
    headers: {
      ...headers,
      ...authHeaders,
      Accept: "application/vnd.git-lfs+json",
    },
    body: JSON.stringify(lfsInfoRequestData),
  });
  const lfsInfoResponseData = await lfsInfoRes.json();
  if (!isValidLFSInfoResponseData(lfsInfoResponseData)) {
    throw new Error(
      "Unexpected JSON structure received for LFS upload request"
    );
  }

  await Promise.all(
    lfsInfoResponseData.objects.map(async (object, index) => {
      // server already has file
      if (!object.actions) return;
      const { actions } = object;

      const resp = await fetch(actions.upload.href, {
        method: "PUT",
        headers: {
          ...headers,
          ...authHeaders,
          ...(actions.upload.header ?? {}),
          Accept: "application/vnd.git-lfs+json",
        },
        body: contents[index],
      });
      if (!resp.ok)
        throw new Error(
          `Upload might have been unsuccessful, upload action yielded HTTP ${resp.status}`
        );

      if (actions.verify) {
        const verificationResp = await fetch(actions.verify.href, {
          method: "POST",
          headers: {
            ...(actions.verify.header ?? {}),
            Accept: "application/vnd.git-lfs+json",
          },
          body: JSON.stringify(infos[index]),
        });
        if (!resp.ok)
          throw new Error(
            `Upload might have been unsuccessful, verification action yielded HTTP ${verificationResp.status}`
          );
      }
    })
  );
  return infos;
}
