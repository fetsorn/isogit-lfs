import { Buffer } from "buffer";

import { isVacantAndWriteable, pointsToLFS } from "./util.js";
import downloadBlobFromPointer from "./download.js";
import { readPointer } from "./pointers.js";

const SYMLINK_MODE = 40960;

// type ProgressHandler = (progress: GitProgressEvent) => void;

/**
 * Populates LFS cache for each repository object that is an LFS pointer.
 *
 * Does not touch working directory.
 *
 * NOTE: If LFS cache path, as extracted from the pointer,
 * is not writeable at the time of download start,
 * the object will be silently skipped.
 *
 * NOTE: This function skips objects silently in case of errors.
 *
 * NOTE: onProgress currently doesn’t report loaded/total values accurately.
 */
// @param {PromiseFsClient} fs
// @param {HttpClinet} http
// @param {string} workDir
// @param {string} remoteURL
// @param {string} ref
// @param {ProgressHandler} onProgress
export default async function populateCache(
  fs,
  http,
  workDir,
  remoteURL,
  ref = "HEAD",
  onProgress
) {
  await git.walk({
    fs,
    dir: workDir,
    trees: [git.TREE({ ref })],
    map: async function lfsDownloadingWalker(filepath, entries) {
      if (entries === null || entries[0] === null) {
        return null;
      }

      onProgress?.({ phase: `skimming: ${filepath}`, loaded: 5, total: 10 });

      const [entry] = entries;
      const entryType = await entry.type();

      if (entryType === "tree") {
        // Walk children
        return true;
      } else if (
        entryType === "blob" &&
        (await entry.mode()) !== SYMLINK_MODE
      ) {
        const content = await entry.content();

        if (content) {
          const buff = Buffer.from(content.buffer);

          if (pointsToLFS(buff)) {
            const pointer = readPointer({ dir: workDir, content: buff });

            // Don’t even start the download if LFS cache path is not accessible,
            // or if it already exists
            if ((await isVacantAndWriteable(pointer.objectPath)) === false)
              return;

            onProgress?.({
              phase: `downloading: ${filepath}`,
              loaded: 5,
              total: 10,
            });

            await downloadBlobFromPointer(
              fs,
              { http, url: remoteURL },
              pointer
            );
          }
        }
      }
      return;
    },
  });
}
