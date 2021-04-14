// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import * as debug_ from "debug";
import { http } from "follow-redirects";
import { IncomingMessage } from "http";
import { PassThrough } from "stream";
import { URL } from "url";

import { IStreamAndLength, IZip, Zip } from "./zip";

// import { bufferToStream } from "../stream/BufferUtils";

const debug = debug_("r2:utils#zip/zip-ex-http");

export class ZipExplodedHTTP extends Zip {

    public static async loadPromise(urlStr: string): Promise<IZip> {
        return Promise.resolve(new ZipExplodedHTTP(urlStr));
    }

    // private readonly url: URL;

    private constructor(readonly urlStr: string) {
        super();
        debug(`ZipExplodedHTTP: ${urlStr}`);
        // this.url = new URL(urlStr);
    }

    public freeDestroy(): void {
        debug("freeDestroy: ZipExplodedHTTP -- " + this.urlStr);
    }

    public entriesCount(): number {
        return 0; // TODO: hacky! (not really needed ... but still)
    }

    public hasEntries(): boolean {
        return true; // TODO: hacky
    }

    public async hasEntry(entryPath: string): Promise<boolean> {

        debug(`hasEntryAsync: ${entryPath}`);

        const url = new URL(this.urlStr);
        // url.pathname += ("/" + entryPath);
        url.pathname += entryPath;
        const urlStrEntry = url.toString();
        debug("urlStrEntry: ", urlStrEntry);

        return new Promise(async (topresolve, _topreject) => {

            const failure = async (err: any) => {
                debug(err);
                // topreject(err);
                topresolve(false);
            };

            const success = async (response: IncomingMessage) => {

                // Object.keys(response.headers).forEach((header: string) => {
                //     debug(header + " => " + response.headers[header]);
                // });

                // debug(response);
                // debug(response.body);

                if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
                    // await failure("HTTP CODE " + response.statusCode);
                    topresolve(false);
                    return;
                }

                topresolve(true);
            };

            const promise = new Promise<void>((resolve, reject) => {
                http.request({
                    ...new URL(urlStrEntry),
                    headers: {},
                    method: "HEAD",
                })
                    .on("response", async (response: IncomingMessage) => {
                        await success(response);
                        resolve();
                    })
                    .on("error", async (err: any) => {
                        await failure(err);
                        reject();
                    })
                    .end();
            });
            try {
                await promise;
            } catch (err) {
                // ignore
            }
        });
    }

    public async getEntries(): Promise<string[]> {

        return new Promise<string[]>(async (_resolve, reject) => {
            reject("Not implemented.");
        });
    }

    public async entryStreamPromise(entryPath: string): Promise<IStreamAndLength> {

        debug(`entryStreamPromise: ${entryPath}`);

        // if (!this.hasEntries() || !this.hasEntry(entryPath)) {
        //     return Promise.reject("no such path in zip exploded: " + entryPath);
        // }

        const url = new URL(this.urlStr);
        // url.pathname += ("/" + entryPath);
        url.pathname += entryPath;
        const urlStrEntry = url.toString();
        debug("urlStrEntry: ", urlStrEntry);

        return new Promise(async (topresolve, topreject) => {

            const failure = async (err: any) => {
                debug(err);
                topreject(err);
            };

            const success = async (response: IncomingMessage) => {

                // Object.keys(response.headers).forEach((header: string) => {
                //     debug(header + " => " + response.headers[header]);
                // });

                // debug(response);
                // debug(response.body);

                if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
                    await failure("HTTP CODE " + response.statusCode);
                    return;
                }

                let length = 0;
                const lengthStr = response.headers["content-length"];
                if (lengthStr) {
                    length = parseInt(lengthStr, 10);
                }

                const stream = new PassThrough();
                response.pipe(stream);

                const streamAndLength: IStreamAndLength = {
                    length,
                    reset: async () => {
                        return this.entryStreamPromise(entryPath);
                    },
                    stream,
                };
                topresolve(streamAndLength);

                // let responseStr: string;
                // if (response.body) {
                //     debug("RES BODY");
                //     responseStr = response.body;
                // } else {
                //     debug("RES STREAM");
                //     let responseData: Buffer;
                //     try {
                //         responseData = await streamToBufferPromise(response);
                //     } catch (err) {
                //         debug(err);
                //         return;
                //     }
                //     responseStr = responseData.toString("utf8");
                // }
            };

            const promise = new Promise<void>((resolve, reject) => {
                http.get({
                    ...new URL(urlStrEntry),
                    headers: {},
                })
                    .on("response", async (response: IncomingMessage) => {
                        await success(response);
                        resolve();
                    })
                    .on("error", async (err: any) => {
                        await failure(err);
                        reject();
                    });
            });
            try {
                await promise;
            } catch (err) {
                // ignore
            }
        });
    }
}
