// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import * as debug_ from "debug";
import { http } from "follow-redirects";
import { IncomingMessage } from "http";
import * as yauzl from "yauzl";

import { isHTTP } from "../http/UrlUtils";
import { streamToBufferPromise } from "../stream/BufferUtils";
import { IStreamAndLength, IZip, Zip } from "./zip";
import { HttpZipReader } from "./zip2RandomAccessReader_Http";

const debug = debug_("r2:utils#zip/zip2");

interface IStringKeyedObject { [key: string]: any; }

export class Zip2 extends Zip {

    public static async loadPromise(filePath: string): Promise<IZip> {
        if (isHTTP(filePath)) {
            return Zip2.loadPromiseHTTP(filePath);
        }

        return new Promise<IZip>((resolve, reject) => {

            yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zip) => {
                if (err || !zip) {
                    debug("yauzl init ERROR");
                    debug(err);
                    reject(err);
                    return;
                }
                const zip2 = new Zip2(filePath, zip);

                zip.on("error", (erro) => {
                    debug("yauzl ERROR");
                    debug(erro);
                    reject(erro);
                });

                zip.readEntry(); // next (lazyEntries)
                zip.on("entry", (entry) => {
                    // if (/\/$/.test(entry.fileName)) {
                    if (entry.fileName[entry.fileName.length - 1] === "/") {
                        // skip directories / folders
                    } else {
                        // debug(entry.fileName);
                        zip2.addEntry(entry);
                    }
                    zip.readEntry(); // next (lazyEntries)
                });

                zip.on("end", () => {
                    debug("yauzl END");
                    resolve(zip2);
                });

                zip.on("close", () => {
                    debug("yauzl CLOSE");
                });
            });
        });
    }

    private static async loadPromiseHTTP(filePath: string): Promise<IZip> {

        return new Promise<IZip>(async (resolve, reject) => {

            const failure = (err: any) => {
                debug(err);
                reject(err);
            };

            const success = async (res: IncomingMessage) => {
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                    failure("HTTP CODE " + res.statusCode);
                    return;
                }

                debug(filePath);
                debug(res.headers);

                // if (!res.headers["content-type"]
                //     || res.headers["content-type"] !== "application/epub+zip") {
                //     reject("content-type not supported!");
                //     return;
                // }

                // TODO: if the HTTP server does not provide Content-Length,
                // then fallback on download, but interrupt (req.abort())
                // if response payload reaches the max limit
                if (!res.headers["content-length"]) {
                    reject("content-length not supported!");
                    return;
                }
                const httpZipByteLength = parseInt(res.headers["content-length"] as string, 10);
                debug(`Content-Length: ${httpZipByteLength}`);

                if (!res.headers["accept-ranges"]
                    // Note: some servers have several headers with the same value!
                    // (erm, https://raw.githubusercontent.com)
                    // (comma-separated values, so we can't match "bytes" exactly)
                    || res.headers["accept-ranges"].indexOf("bytes") < 0) {

                    if (httpZipByteLength > (2 * 1024 * 1024)) {
                        reject("accept-ranges not supported, file too big to download: " + httpZipByteLength);
                        return;
                    }
                    debug("Downloading: " + filePath);

                    const failure_ = (err: any) => {

                        debug(err);
                        reject(err);
                    };

                    const success_ = async (ress: IncomingMessage) => {
                        if (ress.statusCode && (ress.statusCode < 200 || ress.statusCode >= 300)) {
                            failure_("HTTP CODE " + ress.statusCode);
                            return;
                        }

                        // debug(filePath);
                        // debug(res.headers);
                        let buffer: Buffer;
                        try {
                            buffer = await streamToBufferPromise(ress);
                        } catch (err) {
                            debug(err);
                            reject(err);
                            return;
                        }

                        yauzl.fromBuffer(buffer,
                            { lazyEntries: true },
                            (err, zip) => {
                                if (err || !zip) {
                                    debug("yauzl init ERROR");
                                    debug(err);
                                    reject(err);
                                    return;
                                }
                                const zip2 = new Zip2(filePath, zip);

                                zip.on("error", (erro) => {
                                    debug("yauzl ERROR");
                                    debug(erro);
                                    reject(erro);
                                });

                                zip.readEntry(); // next (lazyEntries)
                                zip.on("entry", (entry) => {
                                    if (entry.fileName[entry.fileName.length - 1] === "/") {
                                        // skip directories / folders
                                    } else {
                                        // debug(entry.fileName);
                                        zip2.addEntry(entry);
                                    }
                                    zip.readEntry(); // next (lazyEntries)
                                });

                                zip.on("end", () => {
                                    debug("yauzl END");
                                    resolve(zip2);
                                });

                                zip.on("close", () => {
                                    debug("yauzl CLOSE");
                                });
                            });
                    };

                    http.get({
                        ...new URL(filePath),
                        headers: {},
                    })
                        .on("response", success_)
                        .on("error", failure_);

                    return;
                }

                const httpZipReader = new HttpZipReader(filePath, httpZipByteLength);
                yauzl.fromRandomAccessReader(httpZipReader, httpZipByteLength,
                    { lazyEntries: true, autoClose: false },
                    (err, zip) => {
                        if (err || !zip) {
                            debug("yauzl init ERROR");
                            debug(err);
                            reject(err);
                            return;
                        }
                        (zip as any).httpZipReader = httpZipReader;
                        const zip2 = new Zip2(filePath, zip);

                        zip.on("error", (erro: any) => {
                            debug("yauzl ERROR");
                            debug(erro);
                            reject(erro);
                        });

                        zip.readEntry(); // next (lazyEntries)
                        zip.on("entry", (entry: any) => {
                            if (entry.fileName[entry.fileName.length - 1] === "/") {
                                // skip directories / folders
                            } else {
                                // debug(entry.fileName);
                                zip2.addEntry(entry);
                            }
                            zip.readEntry(); // next (lazyEntries)
                        });

                        zip.on("end", () => {
                            debug("yauzl END");
                            resolve(zip2);
                        });

                        zip.on("close", () => {
                            debug("yauzl CLOSE");
                        });
                    });
            };

            http.request({
                ...new URL(filePath),
                headers: {},
                method: "HEAD",
            })
                .on("response", success)
                .on("error", failure)
                .end();
    });
    }

    private entries: IStringKeyedObject;

    private constructor(readonly filePath: string, readonly zip: any) {
        super();

        // see addEntry()
        this.entries = {};
    }

    public freeDestroy(): void {
        debug("freeDestroy: Zip2 -- " + this.filePath);
        if (this.zip) {
            this.zip.close();
        }
    }

    public entriesCount(): number {
        return this.zip.entryCount;
    }

    public hasEntries(): boolean {
        return this.entriesCount() > 0;
    }

    public async hasEntry(entryPath: string): Promise<boolean> {
        return this.hasEntries() && this.entries[entryPath];
    }

    public async getEntries(): Promise<string[]> {

        if (!this.hasEntries()) {
            return Promise.resolve([]);
        }
        return Promise.resolve(Object.keys(this.entries));
    }

    public async entryStreamPromise(entryPath: string): Promise<IStreamAndLength> {

        // debug(`entryStreamPromise: ${entryPath}`);

        if (!this.hasEntries() || !this.hasEntry(entryPath)) {
            return Promise.reject("no such path in zip: " + entryPath);
        }

        const entry = this.entries[entryPath];

        return new Promise<IStreamAndLength>((resolve, reject) => {

            this.zip.openReadStream(entry, (err: any, stream: NodeJS.ReadableStream) => {
                if (err) {
                    debug("yauzl openReadStream ERROR");
                    debug(err);
                    reject(err);
                    return;
                }
                const streamAndLength: IStreamAndLength = {
                    length: entry.uncompressedSize as number,
                    reset: async () => {
                        return this.entryStreamPromise(entryPath);
                    },
                    stream,
                };
                resolve(streamAndLength);
            });
        });
    }

    private addEntry(entry: any) {
        this.entries[entry.fileName] = entry;
    }
}
