// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import * as debug_ from "debug";
import * as JSZip from "jszip";
import * as rnfs from "react-native-fs";
import {PassThrough} from "stream";

import { IStreamAndLength, IZip, Zip } from "./zip";

// import { bufferToStream } from "../stream/BufferUtils";

const debug = debug_("r2:utils#zip/zip1");

export class Zip1 extends Zip {

    public static async loadPromise(filePath: string): Promise<IZip> {
        const fileContent = await rnfs.readFile(filePath, "base64");
        const zip = await new JSZip().loadAsync(fileContent, {base64: true});

        return new Zip1(filePath, zip);
    }

    private constructor(readonly filePath: string, readonly zip: any) {
        super();
    }

    public freeDestroy(): void {
        debug("freeDestroy: Zip1 -- " + this.filePath);
    }

    public entriesCount(): number {
        return Object.keys((this.zip as JSZip).files).length;
    }

    public hasEntries(): boolean {
        return this.entriesCount() > 0;
    }

    public async hasEntry(entryPath: string): Promise<boolean> {
        return this.hasEntries() && (this.zip as JSZip).file(entryPath) != null;
    }

    public async getEntries(): Promise<string[]> {
        if (!this.hasEntries()) {
            return Promise.resolve([]);
        }

        return Promise.resolve(Object.keys((this.zip as JSZip).files));
    }

    public async entryStreamPromise(entryPath: string): Promise<IStreamAndLength> {
        if (!this.hasEntries() || !this.hasEntry(entryPath)) {
            return Promise.reject("no such path in zip: " + entryPath);
        }

        // return new Promise<IStreamAndLength>((resolve, _reject) => {
        //     const buffer: Buffer = this.zip.entryDataSync(entryPath);
        //     const streamAndLength: IStreamAndLength = {
        //         length: buffer.length,
        //         stream: bufferToStream(buffer),
        //     };
        //     resolve(streamAndLength);
        // });

        const entry = (this.zip as JSZip).file(entryPath);
        const content = await entry!.async("text");

        const contentStream = new PassThrough();
        contentStream.end(content);

        return {
            length: content.length,
            reset: async () => {
                return this.entryStreamPromise(entryPath);
            },
            stream: contentStream,
        };
    }
}
