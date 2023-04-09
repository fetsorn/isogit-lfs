import { Buffer } from "buffer";

export const SPEC_URL = "https://git-lfs.github.com/spec/v1";

export const LFS_POINTER_PREAMBLE = `version ${SPEC_URL}\n`;

/** Returns true if given blob represents an LFS pointer. */
// @param {Buffer} content
// @returns {boolean}
export function pointsToLFS(content) {
  return (
    content[0] === 118 && // 'v'
    // TODO: This is inefficient, it should only search the first line or first few bytes.
    content.indexOf(LFS_POINTER_PREAMBLE) === 0
  );
}

/**
 * Returns properly encoded HTTP Basic auth header,
 * given basic auth credentials.
 */
// @param {BasicAuth} auth
// @returns {object}
export function getAuthHeader(auth) {
  return {
    Authorization: `Basic ${Buffer.from(
      `${auth.username}:${auth.password}`
    ).toString("base64")}`,
  };
}

/**
 * Returns true if given path is available for writing,
 * regardless of whether or not it is occupied.
 */
// @param {PromiseFsClient}
// @param {string} filepath
// @returns {boolean}
export async function isWriteable(
  { promises: fs },
  filepath
) {
  try {
    // TODO: there's no API for this in PromiseFsClient world
    // await fs.access(filepath, fsConstants.W_OK);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") {
      return true;
    }
    return false;
  }
}

/**
 * Returns true if given path is available for writing
 * and not occupied.
 */
// @param {string} filepath
// @returns {boolean}
export async function isVacantAndWriteable(filepath) {
  try {
    // TODO: there's no API for this in PromiseFsClient world
    return true;
    // await fs.access(filepath, fsConstants.W_OK);
  } catch (e) {
    if ((e).code === "ENOENT") {
      return true;
    }
  }
  return false;
}

// @param {Uint8Array[]} body
// @returns {Buffer}
export async function bodyToBuffer(body) {
  const buffers = [];
  let offset = 0;
  let size = 0;
  for await (const chunk of body) {
    buffers.push(chunk);
    size += chunk.byteLength;
  }

  const result = new Uint8Array(size);
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.byteLength;
  }
  return Buffer.from(result.buffer);
}

// Borrowed from Isomorphic Git core, it is not importable.
// @param {ArrayBuffer} buffer
// @returns {string}
export function toHex(buffer) {
  let hex = "";
  for (const byte of new Uint8Array(buffer)) {
    if (byte < 16) hex += "0";
    hex += byte.toString(16);
  }
  return hex;
}
