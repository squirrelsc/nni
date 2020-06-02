/**
 * Copyright (c) Microsoft Corporation
 * All rights reserved.
 *
 * MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 * to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';

import { uniqueString } from '../../../common/utils';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger, getLogger } from '../../../common/log';
import { tarAdd } from '../../common/util';

export abstract class StorageService {
    protected localRoot: string = "";
    protected remoteRoot: string = "";
    protected logger: Logger;

    protected abstract config(key: string, value: string): void;
    protected abstract async remove(remotePath: string, isDirectory: boolean, isRecursive: boolean): Promise<void>;
    protected abstract async rename(remotePath: string, newName: string): Promise<void>;
    protected abstract async mkdir(remotePath: string): Promise<void>;
    protected abstract async copy(localPath: string, remotePath: string, isDirectory: boolean, isToRemote: boolean): Promise<string>;
    protected abstract async exists(remotePath: string): Promise<boolean>;
    protected abstract async read(remotePath: string, offset: number, length: number): Promise<string>;
    protected abstract isRelativePath(path: string): boolean;
    protected abstract joinPath(...paths: string[]): string;
    protected abstract dirname(...paths: string[]): string;
    protected abstract basename(...paths: string[]): string;

    constructor() {
        this.logger = getLogger();
    }

    public initialize(localRoot: string, remoteRoot: string): void {
        this.logger.debug(`Initializing storage to local: ${localRoot} remote: ${remoteRoot}`);
        this.localRoot = localRoot;
        this.remoteRoot = remoteRoot;
    }

    public async renameRemote(remotePath: string, newName: string): Promise<void> {
        remotePath = this.expandPath(true, remotePath);
        this.logger.debug(`rename remotePath: ${remotePath} to: ${newName}`);
        await this.rename(remotePath, newName);
    }

    public async createDirectory(remotePath: string): Promise<void> {
        remotePath = this.expandPath(true, remotePath);
        this.logger.debug(`create remotePath: ${remotePath}`);
        await this.mkdir(remotePath);
    }

    public async copyDirectory(localPath: string, remotePath: string, asGzip: boolean = false): Promise<string> {
        localPath = this.expandPath(false, localPath);
        remotePath = this.expandPath(true, remotePath);
        this.logger.debug(`copy localPath: ${localPath} to remotePath: ${remotePath}, asGzip ${asGzip}`);
        if (!await this.existsRemote(remotePath)) {
            await this.mkdir(remotePath);
        }

        if (asGzip) {
            const localPathBaseName = path.basename(localPath);
            const tempTarFileName = `nni_tmp_${localPathBaseName}_${uniqueString(5)}.tar.gz`;
            const tarFileName = `${localPathBaseName}.tar.gz`;
            const localTarPath: string = path.join(os.tmpdir(), tempTarFileName);
            await tarAdd(localTarPath, localPath);
            await this.copy(localTarPath, remotePath, false, true);
            const remoteFileName = this.joinPath(remotePath, tempTarFileName);
            await this.rename(remoteFileName, tarFileName);
            await fs.promises.unlink(localTarPath);

            remotePath = this.joinPath(remotePath, tarFileName);
        } else {
            await this.copy(localPath, remotePath, true, true);
            remotePath = this.joinPath(remotePath, path.basename(localPath));
        }

        return remotePath;
    }

    public async copyDirectoryBack(remotePath: string, localPath: string): Promise<string> {
        localPath = this.expandPath(false, localPath);
        remotePath = this.expandPath(true, remotePath);
        this.logger.debug(`copy remotePath: ${remotePath} to localPath: ${localPath}`);
        return await this.copy(localPath, remotePath, true, false);
    }

    public async removeDirectory(remotePath: string, isRecursive: boolean): Promise<void> {
        remotePath = this.expandPath(true, remotePath);
        this.logger.debug(`remove remotePath: ${remotePath}`);
        await this.remove(remotePath, true, isRecursive);
    }

    public async readRemoteFile(remotePath: string, offset: number = -1, length: number = -1): Promise<string> {
        remotePath = this.expandPath(true, remotePath);
        this.logger.debug(`read remote file: ${remotePath}, offset: ${offset}, length: ${length}`);
        return this.read(remotePath, offset, length);
    }

    public async existsRemote(remotePath: string): Promise<boolean> {
        remotePath = this.expandPath(true, remotePath);
        const exists = await this.exists(remotePath);
        this.logger.debug(`check exists remotePath: ${remotePath} is ${exists}`);
        return exists
    }

    public async save(content: string, remotePath: string): Promise<void> {
        this.logger.debug(`save content to remotePath: ${remotePath}, length: ${content.length}`);
        const fileName = this.basename(remotePath);
        const tempFileName = `temp_${uniqueString(4)}_${fileName}`;

        remotePath = this.expandPath(true, remotePath);
        const localTempFileName = path.join(os.tmpdir(), tempFileName);

        const remoteDir = this.dirname(remotePath);
        const remoteTempFile = this.joinPath(remoteDir, tempFileName);

        if (await this.exists(remotePath) === true) {
            await this.remove(remotePath, false, false);
        }
        await fs.promises.writeFile(localTempFileName, content);
        await this.copy(localTempFileName, remoteDir, false, true);
        await this.renameRemote(remoteTempFile, fileName);
        await fs.promises.unlink(localTempFileName);
    }

    public async copyFile(localPath: string, remotePath: string): Promise<void> {
        localPath = this.expandPath(false, localPath);
        remotePath = this.expandPath(true, remotePath);
        this.logger.debug(`copy file localPath: ${localPath} to remotePath: ${remotePath}`);
        await this.copy(localPath, remotePath, false, true);
    }

    public async copyFileBack(remotePath: string, localPath: string): Promise<void> {
        localPath = this.expandPath(false, localPath);
        remotePath = this.expandPath(true, remotePath);
        this.logger.debug(`copy file remotePath: ${remotePath} to localPath: ${localPath}`);
        await this.copy(localPath, remotePath, false, false);
    }

    public async removeFile(remotePath: string): Promise<void> {
        remotePath = this.expandPath(true, remotePath);
        this.logger.debug(`remove file remotePath: ${remotePath}`);
        await this.remove(remotePath, false, false);
    }

    public joinRemotePath(...paths: string[]): string {
        let fullPath = this.joinPath(...paths);
        if (this.isRelativePath(fullPath) === true && this.remoteRoot !== "") {
            fullPath = this.joinPath(this.remoteRoot, fullPath);
        }
        return fullPath;
    }

    private expandPath(isRemote: boolean, ...paths: string[]): string {
        let normalizedPath: string;

        if (isRemote) {
            normalizedPath = this.joinRemotePath(...paths);
        } else {
            normalizedPath = path.join(...paths);
            if (!path.isAbsolute(normalizedPath) && this.localRoot !== "") {
                normalizedPath = path.join(this.localRoot, normalizedPath);
            }
        }

        return normalizedPath;
    }
}
