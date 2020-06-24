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

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as component from '../../common/component';
import { getExperimentId, getPlatform } from '../../common/experimentStartupInfo';
import { getLogger, Logger } from '../../common/log';
import { NNIManagerIpConfig, TrainingService, TrialJobApplicationForm, TrialJobMetric, TrialJobStatus } from '../../common/trainingService';
import { delay, getLogLevel, getVersion, uniqueString } from '../../common/utils';
import { GPU_INFO, INITIALIZED, KILL_TRIAL_JOB, NEW_TRIAL_JOB, SEND_TRIAL_JOB_PARAMETER, TRIAL_END } from '../../core/commands';
import { GPUSummary } from '../../training_service/common/gpuData';
import { CONTAINER_INSTALL_NNI_SHELL_FORMAT } from '../common/containerJobData';
import { TrialConfig } from '../common/trialConfig';
import { TrialConfigMetadataKey } from '../common/trialConfigMetadataKey';
import { validateCodeDir } from '../common/util';
import { WebCommandChannel } from './channels/webCommandChannel';
import { Command, CommandChannel } from './commandChannel';
import { EnvironmentInformation, EnvironmentService, NodeInfomation, RunnerSettings } from './environment';
import { JobRestServer } from './jobRestServer';
import { StorageService } from './storageService';
import { TrialDetail } from './trial';

/**
 * It uses to manage jobs on training platforms 
 * and expose trial as trial job to upper level.
**/
@component.Singleton
class TrialDispatcher implements TrainingService {

    private readonly log: Logger;
    private readonly isDeveloping: boolean = false;
    private stopping: boolean = false;

    private jobRestServer: JobRestServer;
    private readonly metricsEmitter: EventEmitter;
    private versionCheck: boolean = true;
    private readonly experimentId: string;

    private trialConfig: TrialConfig | undefined;
    private runnerSettings: RunnerSettings;

    private commandEmitter: EventEmitter;

    private readonly trials: Map<string, TrialDetail>;
    private readonly environments: Map<string, EnvironmentInformation>;
    private readonly commandChannel: CommandChannel;

    constructor() {
        this.log = getLogger();
        this.trials = new Map<string, TrialDetail>();
        this.environments = new Map<string, EnvironmentInformation>();
        this.metricsEmitter = new EventEmitter();
        this.jobRestServer = new JobRestServer(this.metricsEmitter);
        this.experimentId = getExperimentId();
        this.runnerSettings = new RunnerSettings();
        this.runnerSettings.experimentId = this.experimentId;
        this.runnerSettings.platform = getPlatform();

        this.commandEmitter = new EventEmitter();
        this.commandChannel = new WebCommandChannel(this.commandEmitter);

        const logLevel = getLogLevel();
        this.log.debug(`current folder ${__dirname}`);
        // different source folder in Linux and Windows
        if (logLevel == "debug" && (fs.existsSync("../../../src/nni_manager") || __dirname.endsWith("src\\nni_manager\\dist\\training_service\\reusable"))) {
            this.log.debug("log level is debug, and exist code folder, so set to developing mode.");
            this.isDeveloping = true;
            this.runnerSettings.enableGpuCollector = true;
        }
    }

    public async listTrialJobs(): Promise<TrialDetail[]> {
        const trials: TrialDetail[] = [];

        for (const key of this.trials.keys()) {
            trials.push(await this.getTrialJob(key));
        }

        return trials;
    }

    public async getTrialJob(trialJobId: string): Promise<TrialDetail> {
        const trial: TrialDetail | undefined = this.trials.get(trialJobId);
        if (trial === undefined) {
            throw new Error(`trial job ${trialJobId} not found`);
        }

        return trial;
    }

    public async submitTrialJob(form: TrialJobApplicationForm): Promise<TrialDetail> {
        if (this.trialConfig === undefined) {
            throw new Error(`trialConfig not initialized!`);
        }

        const trialId: string = uniqueString(5);

        const environmentService = component.get<EnvironmentService>(EnvironmentService);
        let trialWorkingFolder: string = "";
        if (environmentService.hasStorageService) {
            const storageService = component.get<StorageService>(StorageService);
            trialWorkingFolder = storageService.joinPath('trials', trialId);
        }
        const trialJobDetail: TrialDetail = new TrialDetail(trialId, "WAITING", Date.now(), trialWorkingFolder, form);

        this.trials.set(trialId, trialJobDetail);

        return trialJobDetail;
    }

    // to support multi phase
    public async updateTrialJob(trialJobId: string, form: TrialJobApplicationForm): Promise<TrialDetail> {
        const trialDetail = await this.getTrialJob(trialJobId);
        const environment = trialDetail.environment;
        if (environment === undefined) {
            throw new Error(`TrialDispatcher: trial ${trialJobId}'s env shouldn't be undefined in updateTrialJob.`);
        }

        const message = {
            "trialId": trialJobId,
            "parameters": form.hyperParameters,
        }
        await this.commandChannel.sendCommand(environment, SEND_TRIAL_JOB_PARAMETER, message);

        return trialDetail;
    }

    public async cancelTrialJob(trialJobId: string, isEarlyStopped?: boolean | undefined): Promise<void> {
        const trial = await this.getTrialJob(trialJobId);
        switch (trial.status) {
            case "RUNNING":
            case "WAITING":
            case "UNKNOWN":
                {
                    const environment = trial.environment;
                    if (environment) {
                        await this.commandChannel.sendCommand(environment, KILL_TRIAL_JOB, trial.id);
                        trial.isEarlyStopped = isEarlyStopped;
                        trial.status = trial.isEarlyStopped === true ?
                            'EARLY_STOPPED' : 'USER_CANCELED';
                        this.releaseEnvironment(trial);
                    }
                }
                break;
        }
    }

    public async run(): Promise<void> {

        await this.jobRestServer.start();
        this.jobRestServer.setEnableVersionCheck = this.versionCheck;
        this.log.info(`TrialDispatcher: rest server listening on: ${this.jobRestServer.endPoint}`);
        this.runnerSettings.nniManagerPort = this.jobRestServer.clusterRestServerPort;
        this.runnerSettings.commandChannel = this.commandChannel.channelName;

        // for restful api, other channel can ignore this.
        this.commandChannel.config("RestServer", this.jobRestServer.Server);
        // start channel
        this.commandEmitter.on("command", (command: Command): void => {
            this.handleCommand(command).catch((err: Error) => {
                this.log.error(`TrialDispatcher: error on handle env ${command.environment.id} command: ${command.command}, data: ${command.data}, error: ${err}`);
            })
        });
        this.commandChannel.start();
        this.log.info(`TrialDispatcher: started channel: ${this.commandChannel.constructor.name}`);

        if (this.trialConfig === undefined) {
            throw new Error(`trial config shouldn't be undefined in run()`);
        }

        const environmentService = component.get<EnvironmentService>(EnvironmentService);
        if (environmentService.hasStorageService) {
            this.log.info(`TrialDispatcher: copying code and settings.`);
            const storageService = component.get<StorageService>(StorageService);
            // Copy the compressed file to remoteDirectory and delete it
            const codeDir = path.resolve(this.trialConfig.codeDir);
            const envDir = storageService.joinPath("envs");
            const codeFileName = await storageService.copyDirectory(codeDir, envDir, true);
            storageService.rename(codeFileName, "nni-code.tar.gz");

            const installFileName = storageService.joinPath(envDir, 'install_nni.sh');
            await storageService.save(CONTAINER_INSTALL_NNI_SHELL_FORMAT, installFileName);

            const runnerSettings = storageService.joinPath(envDir, "settings.json");
            await storageService.save(JSON.stringify(this.runnerSettings), runnerSettings);

            if (this.isDeveloping) {
                let trialToolsPath = path.join(__dirname, "../../../../../tools/nni_trial_tool");
                if (false === fs.existsSync(trialToolsPath)) {
                    trialToolsPath = path.join(__dirname, "..\\..\\..\\..\\..\\tools\\nni_trial_tool");
                }
                await storageService.copyDirectory(trialToolsPath, envDir, true);
            }
        }

        this.log.info(`TrialDispatcher: run loop started.`);
        await Promise.all([
            this.environmentMaintenanceLoop(),
            this.trialManagementLoop(),
        ]);
    }

    public addTrialJobMetricListener(listener: (metric: TrialJobMetric) => void): void {
        this.metricsEmitter.on('metric', listener);
    }

    public removeTrialJobMetricListener(listener: (metric: TrialJobMetric) => void): void {
        this.metricsEmitter.off('metric', listener);
    }

    public get isMultiPhaseJobSupported(): boolean {
        return true;
    }

    public async setClusterMetadata(key: string, value: string): Promise<void> {
        switch (key) {
            case TrialConfigMetadataKey.NNI_MANAGER_IP:
                this.runnerSettings.nniManagerIP = (<NNIManagerIpConfig>JSON.parse(value)).nniManagerIp;
                break;
            case TrialConfigMetadataKey.VERSION_CHECK:
                this.versionCheck = (value === 'true' || value === 'True');
                this.runnerSettings.nniManagerVersion = this.versionCheck ? await getVersion() : '';
                break;
            case TrialConfigMetadataKey.LOG_COLLECTION:
                this.runnerSettings.logCollection = value;
                break;
            case TrialConfigMetadataKey.TRIAL_CONFIG:
                // TODO to support more storage types by better parameters.
                this.trialConfig = <TrialConfig>JSON.parse(value);

                this.runnerSettings.command = this.trialConfig.command;
                // Validate to make sure codeDir doesn't have too many files
                await validateCodeDir(this.trialConfig.codeDir);
                break;
        }
        const environmentService = component.get<EnvironmentService>(EnvironmentService);
        await environmentService.config(key, value);
    }

    public getClusterMetadata(_key: string): Promise<string> {
        throw new Error('Not implemented!');
    }

    public async cleanUp(): Promise<void> {
        this.stopping = true;
        const environmentService = component.get<EnvironmentService>(EnvironmentService);
        const environments = [...this.environments.values()];

        for (let index = 0; index < environments.length; index++) {
            const environment = environments[index];
            if (environment.isAlive === true) {
                this.log.info(`stopping environment ${environment.id}...`);
                await environmentService.stopEnvironment(environment);
                await this.commandChannel.close(environment);
                this.log.info(`stopped environment ${environment.id}.`);
            }
        }

        try {
            await this.jobRestServer.stop();
            this.log.info('Rest server stopped successfully.');
        } catch (error) {
            this.log.error(`Rest server stopped failed, error: ${error.message}`);
        }

        this.commandEmitter.off("command", this.handleCommand);
        this.commandChannel.stop();
    }

    private async environmentMaintenanceLoop(): Promise<void> {
        const environmentService = component.get<EnvironmentService>(EnvironmentService);
        while (!this.stopping) {
            const environments: EnvironmentInformation[] = [];
            for (const environment of this.environments.values()) {
                if (environment.isAlive === true) {
                    environments.push(environment);
                } else {
                    await this.commandChannel.close(environment);
                }
            }
            await environmentService.refreshEnvironmentsStatus(environments);

            environments.forEach((environment) => {
                const oldIsAlive = environment.isAlive;
                switch (environment.status) {
                    case 'WAITING':
                    case 'RUNNING':
                    case 'UNKNOWN':
                        environment.isAlive = true;
                        break;
                    default:
                        environment.isAlive = false;
                        break;
                }
                if (oldIsAlive !== environment.isAlive) {
                    this.log.debug(`set environment ${environment.id} isAlive from ${oldIsAlive} to ${environment.isAlive} due to status is ${environment.status}.`);
                }
            });
            await delay(5000);
        }
    }

    private async trialManagementLoop(): Promise<void> {
        while (!this.stopping) {
            await delay(2000);

            const toRefreshedTrials: TrialDetail[] = [];
            for (const trial of this.trials.values()) {
                if (trial.status === "RUNNING" || trial.status === "WAITING" || trial.status === "UNKNOWN") {
                    toRefreshedTrials.push(trial);
                }
            }

            if (toRefreshedTrials.length == 0) {
                continue;
            }

            const waitingTrials: TrialDetail[] = [];
            let liveTrialsCount = 0;
            for (const trial of toRefreshedTrials) {
                const currentStatus = trial.status;
                switch (currentStatus) {
                    case "RUNNING":
                        {
                            const environment = trial.environment;

                            if (environment === undefined) {
                                this.log.error(`found running trial ${trial.id} has no environment, set trial to UNKNOWN.`);
                                trial.status = "UNKNOWN";
                                liveTrialsCount++;
                                continue;
                            }
                            const environmentStatus = environment.status;

                            // any node exit, then make sure the whole trial stopped.
                            if (trial.nodes.size > 0) {
                                const completedCount = trial.nodes.size;
                                let finalStatus: TrialJobStatus = "SUCCEEDED";
                                let lastTimestamp: number | undefined;
                                this.log.debug(`found ${completedCount} completed trial node(s), nodeCount: ${environment.nodeCount}`);

                                // if some trial processes doesn't exit, kill it for next one.
                                // for example, in horovod, it's just sleep command, has no impact on trial result.
                                if (environment.nodeCount > completedCount) {
                                    this.log.info(`stop partial completed trial ${trial.id}`);
                                    await this.commandChannel.sendCommand(environment, KILL_TRIAL_JOB, trial.id);
                                }
                                for (const node of trial.nodes.values()) {
                                    if (node.status === "FAILED") {
                                        finalStatus = "FAILED";
                                    }
                                    if (node.endTime !== undefined) {
                                        if (lastTimestamp === undefined) {
                                            lastTimestamp = node.endTime
                                        } else {
                                            lastTimestamp = Math.max(node.endTime, lastTimestamp);
                                        }
                                    }
                                }
                                trial.status = finalStatus;
                                if (lastTimestamp === undefined) {
                                    trial.endTime = lastTimestamp;
                                }
                                this.releaseEnvironment(trial);
                            } else if (environmentStatus !== "RUNNING") {
                                this.log.error(`found running trial ${trial.id} on '${environment.jobId}' with '${environmentStatus}', set trial to environment status.`);
                                this.releaseEnvironment(trial);
                                trial.status = environmentStatus;
                            } else {
                                liveTrialsCount++;
                            }
                        }
                        break;
                    case "WAITING":
                    case "UNKNOWN":
                        // deal it later, if there is free environment.
                        waitingTrials.push(trial);
                        liveTrialsCount++;
                        break;
                }
            }

            let liveEnvironmentsCount = 0;
            const idleEnvironments: EnvironmentInformation[] = [];
            this.environments.forEach((environment) => {
                if (environment.isAlive === true) {
                    liveEnvironmentsCount++;
                    if (environment.status === "RUNNING" && environment.isIdle) {
                        idleEnvironments.push(environment);
                    }
                }
            });

            while (idleEnvironments.length > 0 && waitingTrials.length > 0) {
                const trial = waitingTrials.shift();
                const idleEnvironment = idleEnvironments.shift();
                if (trial !== undefined && idleEnvironment != undefined) {
                    await this.assignEnvironment(trial, idleEnvironment);
                }
            }

            if (liveEnvironmentsCount < liveTrialsCount) {
                this.log.info(`request new environment, since live trials ${liveTrialsCount} ` +
                    `is more than live environments ${liveEnvironmentsCount}`);
                for (let index = 0; index < liveTrialsCount - liveEnvironmentsCount; index++) {
                    await this.requestEnvironment();
                }
            }
        }
    }

    private async requestEnvironment(): Promise<void> {
        const environmentService = component.get<EnvironmentService>(EnvironmentService);
        const envId = uniqueString(5);
        const name = `nni_exp_${this.experimentId}_env_${envId}`;
        const environment = new EnvironmentInformation(envId, name);

        environment.command = `sh ../install_nni.sh && python3 -m nni_trial_tool.trial_runner`;

        if (this.isDeveloping) {
            environment.command = "[ -d \"nni_trial_tool\" ] && echo \"nni_trial_tool exists already\" || (mkdir ./nni_trial_tool && tar -xof ../nni_trial_tool.tar.gz -C ./nni_trial_tool) && pip3 install websockets && " + environment.command;
        }

        if (environmentService.hasStorageService) {
            const storageService = component.get<StorageService>(StorageService);
            environment.workingFolder = storageService.joinPath("envs", envId);
            await storageService.createDirectory(environment.workingFolder);
        }

        this.environments.set(environment.id, environment);
        await environmentService.startEnvironment(environment);

        if (environment.status === "FAILED") {
            environment.isIdle = false;
            environment.isAlive = false;
            throw new Error(`error on request environment ${environment.jobId}, please check log for more details.`);
        } else {
            environment.isIdle = true;
            environment.isAlive = true;
        }

        await this.commandChannel.open(environment);
        this.log.info(`requested environment ${environment.id} and job id is ${environment.jobId}.`);
    }

    private async assignEnvironment(trial: TrialDetail, environment: EnvironmentInformation): Promise<void> {
        if (trial.environment) {
            throw new Error(`trial ${trial.id} has assigned environment ${trial.environment.id} already, not assign to ${environment.id}!`);
        }
        if (environment.isIdle == false) {
            throw new Error(`environment ${environment.id} is not idle, and cannot be assigned again!`);
        }
        this.log.info(`assigning environment ${environment.id} to trial ${trial.id}.`);

        environment.isIdle = false;
        trial.environment = environment;
        trial.settings = {
            trialId: trial.id,
            sequenceId: trial.form.sequenceId,
            parameter: trial.form.hyperParameters,
        }
        trial.startTime = Date.now();
        trial.status = "RUNNING";
        await this.commandChannel.sendCommand(trial.environment, NEW_TRIAL_JOB, trial.settings);
    }

    private releaseEnvironment(trial: TrialDetail): void {
        if (!trial.environment) {
            throw new Error(`environment is not assigned to trial ${trial.id}, and cannot be released!`);
        }
        if (trial.environment.isIdle) {
            throw new Error(`environment ${trial.environment.id} is idle already!`);
        }
        trial.environment.isIdle = true;
        trial.environment = undefined;
    }

    private async handleCommand(command: Command): Promise<void> {
        this.log.debug(`TrialDispatcher: env ${command.environment.id} received command ${command.command}, data: ${command.data}`);
        const environment = command.environment;
        const data = command.data;
        const nodeId = data["node"];
        switch (command.command) {
            case GPU_INFO:
                environment.gpuSummary.set(nodeId, <GPUSummary>(data));
                break;
            case INITIALIZED:
                {
                    const oldStatus = environment.status;
                    let isAllReady = true;

                    if (environment.nodeCount > 1) {
                        let node = environment.nodes.get(nodeId);
                        if (node === undefined) {
                            node = new NodeInfomation(nodeId);
                            environment.nodes.set(nodeId, node);
                        }
                        const oldNodeStatus = node.status;
                        if (oldNodeStatus === "UNKNOWN" || oldNodeStatus === "WAITING") {
                            node.status = "RUNNING";
                        }

                        if (environment.nodes.size === environment.nodeCount) {
                            for (const node of environment.nodes.values()) {
                                if (node.status !== "RUNNING") {
                                    isAllReady = false;
                                    break;
                                }
                            }
                        } else {
                            isAllReady = false;
                        }
                    }

                    // single node is always ready to set env status
                    if (isAllReady && oldStatus === "UNKNOWN") {
                        environment.status = "RUNNING";
                        this.log.info(`TrialDispatcher: env ${environment.id} received initialized message, old status: ${oldStatus}, new status: ${environment.status}.`);
                    }
                }
                break;
            case TRIAL_END:
                {
                    const trialId = data["trial"];
                    const trial = await this.getTrialJob(trialId);
                    const code = parseInt(data["code"]);
                    const timestamp = parseInt(data["time"]);
                    let exitStatus: TrialJobStatus = "SUCCEEDED";
                    if (code !== 0) {
                        exitStatus = "FAILED";
                    }

                    let node = environment.nodes.get(nodeId);
                    if (node === undefined) {
                        node = new NodeInfomation(nodeId);
                        trial.nodes.set(nodeId, node);
                    }
                    if (undefined === node) {
                        throw new Error("node is impossible to be undefined (see above code), but make eslint happy!");
                    }
                    node.status = exitStatus;
                    node.endTime = timestamp;
                }
                break;
        }
    }
}

export { TrialDispatcher };
