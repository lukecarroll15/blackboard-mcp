import { createWriteStream, promises as fs } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { BlackboardError } from './errors.js';

/**
 * Ceiling on a single attachment. Downloads stream to disk, so this guards the
 * disk rather than memory: it sits well above any lecture recording but stops
 * a runaway or mislabelled response from filling the drive.
 */
export const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function tooLargeError(maxBytes: number, declaredBytes?: number): BlackboardError {
  const limit = `${Math.round(maxBytes / 1024 / 1024)} MB`;
  const size = declaredBytes !== undefined ? `${Math.round(declaredBytes / 1024 / 1024)} MB, ` : 'over ';
  return new BlackboardError('CONTENT_NOT_AVAILABLE', `Attachment is too large to download (${size}limit ${limit}).`);
}

/**
 * Stream a response body to `dest`, counting bytes as they pass. Stops and
 * removes the partial file the moment the count passes `maxBytes`, so a
 * response with no (or a lying) Content-Length still cannot overrun the cap.
 * Returns the number of bytes written.
 */
export async function writeBodyToFile(
  body: WebReadableStream<Uint8Array> | ReadableStream<Uint8Array>,
  dest: string,
  maxBytes = MAX_DOWNLOAD_BYTES,
): Promise<number> {
  let total = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (total > maxBytes) cb(tooLargeError(maxBytes));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as WebReadableStream<Uint8Array>), counter, createWriteStream(dest));
  } catch (err) {
    await fs.rm(dest, { force: true });
    throw err;
  }
  return total;
}
