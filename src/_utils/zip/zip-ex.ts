// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import * as debug_ from "debug";
import * as path from "path";
import * as rnfs from "react-native-fs";
import * as stream from "stream";

import { IStreamAndLength, IZip, Zip } from "./zip";

// import { bufferToStream } from "../stream/BufferUtils";

const debug = debug_("r2:utils#zip/zip-ex");

export class ZipExploded extends Zip {

    public static async loadPromise(dirPath: string): Promise<IZip> {
        return Promise.resolve(new ZipExploded(dirPath));
    }

    private constructor(readonly dirPath: string) {
        super();
    }

    public freeDestroy(): void {
        debug("freeDestroy: ZipExploded -- " + this.dirPath);
    }

    public entriesCount(): number {
        return 0; // TODO: hacky! (not really needed ... but still)
    }

    public hasEntries(): boolean {
        return true; // TODO: hacky
    }

    public async hasEntry(entryPath: string): Promise<boolean> {
        try {
            await rnfs.stat(path.join(this.dirPath, entryPath));
            return this.hasEntries();
        } catch (_) {
            return false;
        }
    }

    public async getEntries(): Promise<string[]> {

        return new Promise<string[]>(async (resolve, _reject) => {

            const dirStats = await rnfs.stat(this.dirPath);
            const dirPathNormalized = dirStats.originalFilepath;

            const files: rnfs.ReadDirItem[] = await rnfs.readDir(this.dirPath);

            const adjustedFiles = await Promise.all(files.map(async (file) => {
                const fileStats = await rnfs.stat(file.path);
                const filePathNormalized = fileStats.originalFilepath;

                let relativeFilePath = filePathNormalized.replace(dirPathNormalized, "");
                debug(relativeFilePath);

                // TODO: is this necessary?
                if (relativeFilePath.indexOf("/") === 0) {
                    relativeFilePath = relativeFilePath.substr(1);
                }

                return relativeFilePath;
            }));
            resolve(adjustedFiles);
        });
    }

    public async entryStreamPromise(entryPath: string): Promise<IStreamAndLength> {

        // debug(`entryStreamPromise: ${entryPath}`);

        const hasEntry = await this.hasEntry(entryPath);

        if (!this.hasEntries() || !hasEntry) {
            return Promise.reject("no such path in zip exploded: " + entryPath);
        }

        const fullPath = path.join(this.dirPath, entryPath);
        const stats = await rnfs.stat(fullPath);
        const content = await rnfs.readFile(fullPath);

        const fileStream = stream.Readable.from(content);

        const streamAndLength: IStreamAndLength = {
            length: Number(stats.size),
            reset: async () => {
                return this.entryStreamPromise(entryPath);
            },
            stream: fileStream,
        };

        return Promise.resolve(streamAndLength);
    }
}
