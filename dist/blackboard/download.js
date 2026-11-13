import { createWriteStream, promises as fs } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BlackboardError } from './errors.js';
/**
 * Ceiling on a single attachment. Downloads stream to disk, so this guards the
 * disk rather than memory: it sits well above any lecture recording but stops
 * a runaway or mislabelled response from filling the drive.
 */
export const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;
export function tooLargeError(maxBytes, declaredBytes) {
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
export async function writeBodyToFile(body, dest, maxBytes = MAX_DOWNLOAD_BYTES) {
    let total = 0;
    const counter = new Transform({
        transform(chunk, _enc, cb) {
            total += chunk.length;
            if (total > maxBytes)
                cb(tooLargeError(maxBytes));
            else
                cb(null, chunk);
        },
    });
    try {
        await pipeline(Readable.fromWeb(body), counter, createWriteStream(dest));
    }
    catch (err) {
        await fs.rm(dest, { force: true });
        throw err;
    }
    return total;
}
