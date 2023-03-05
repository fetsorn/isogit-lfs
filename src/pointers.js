import path from "path";
import { Buffer } from "buffer";
import { SPEC_URL, toHex } from "./util.js";

// export interface PointerInfo {
//   /** OID (currently, SHA256 hash) of actual blob contents. */
//   oid: string;

//   /** Actual blob size in bytes. */
//   size: number;
// }

// export interface Pointer {
//   info: PointerInfo;

//   /** Absolute path to actual blob in LFS cache. */
//   objectPath: string;
// }

// @param {object} val
// @return bool
function isValidPointerInfo(val) {
  return val.oid.trim !== undefined && typeof val.size === "number";
}

// @param {Buffer} content
// @returns {PointerInfo}
export function readPointerInfo(content) {
  const info = content
    .toString()
    .trim()
    .split("\n")
    .reduce((accum, line) => {
      const [k, v] = line.split(" ", 2);
      if (k === "oid") {
        accum[k] = v.split(":", 2)[1];
      } else if (k === "size") {
        accum[k] = parseInt(v, 10);
      }
      return accum;
    }, {});

  if (isValidPointerInfo(info)) {
    return info;
  } else {
    throw new Error("LFS pointer is incomplete or cannot be read");
  }
}

// interface PointerRequest {
//   dir: string;
//   gitdir?: string;
//   content: Buffer;
// }

// @param {PointerRequest}
// @returns {Pointer}
export function readPointer({
  dir,
  gitdir = path.join(dir, ".git"),
  content,
}) {
  const info = readPointerInfo(content);

  const objectPath = path.join(
    gitdir,
    "lfs",
    "objects",
    info.oid.substr(0, 2),
    info.oid.substr(2, 2),
    info.oid
  );

  return { info, objectPath };
}

/** Formats given PointerInfo for writing in Git tree. */
// @param {PointerInfo} info
// @returns {Buffer}
export function formatPointerInfo(info) {
  const lines = [
    `version ${SPEC_URL}`,
    `oid sha256:${info.oid}`,
    `size ${info.size}`,
    "",
  ];
  return Buffer.from(lines.join("\n"));
}

// @param {Buffer} content
// @returns {PointerInfo}
export async function buildPointerInfo(content) {
  const size = content.byteLength;

  let hashBuffer;

  if (typeof window === 'undefined') {
    const crypto = await import('crypto');

    hashBuffer = await crypto.webcrypto.subtle.digest(
      'SHA-256',
      content,
    );
  } else {
    hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      content,
    );
  }

  const oid = toHex(hashBuffer);

  return { oid, size };
}
