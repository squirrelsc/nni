<p align="center">
<img src="./docs/img/nni_logo.png" alt="logo" width="300"/>
</p>

* * *

[![MIT 许可证](https://img.shields.io/badge/license-MIT-yellow.svg)](https://github.com/Microsoft/nni/blob/master/LICENSE) [![生成状态](https://msrasrg.visualstudio.com/NNIOpenSource/_apis/build/status/Microsoft.nni)](https://msrasrg.visualstudio.com/NNIOpenSource/_build/latest?definitionId=6) [![问题](https://img.shields.io/github/issues-raw/Microsoft/nni.svg)](https://github.com/Microsoft/nni/issues?q=is%3Aissue+is%3Aopen) [![缺陷](https://img.shields.io/github/issues/Microsoft/nni/bug.svg)](https://github.com/Microsoft/nni/issues?q=is%3Aissue+is%3Aopen+label%3Abug) [![拉取请求](https://img.shields.io/github/issues-pr-raw/Microsoft/nni.svg)](https://github.com/Microsoft/nni/pulls?q=is%3Apr+is%3Aopen) [![版本](https://img.shields.io/github/release/Microsoft/nni.svg)](https://github.com/Microsoft/nni/releases) [![进入 https://gitter.im/Microsoft/nni 聊天室提问](https://badges.gitter.im/Microsoft/nni.svg)](https://gitter.im/Microsoft/nni?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

NNI (Neural Network Intelligence) 是自动机器学习（AutoML）实验的工具包。 它通过多种调优的算法来搜索最好的神经网络结构和（或）超参，并支持单机、本地多机、云等不同的运行环境。

<p align="center">
<img src="./docs/img/nni_arch_overview.png" alt="logo"/>
</p>

## **使用场景**

* 在本地尝试不同的自动机器学习算法来训练模型。
* 在分布式环境中加速自动机器学习（如：远程 GPU 工作站和云服务器）。
* 定制自动机器学习算法，或比较不同的自动机器学习算法。
* 在自己的机器学习平台中支持自动机器学习。

## **安装和验证**

**通过 pip 命令安装**

* 当前支持 Linux 和 MacOS。测试并支持的版本包括：Ubuntu 16.04 及更高版本，MacOS 10.14.1。 在 `python >= 3.5` 的环境中，只需要运行 `pip install` 即可完成安装。 

```bash
    python3 -m pip install --user --upgrade nni
```

* 注意： 
  * 如果在 docker 容器中以 root 运行，需要从上述安装命令中删除 `--user`。
  * 如果遇到如`Segmentation fault` 这样的任何错误请参考 [常见问题](docs/FAQ.md)。

**通过源代码安装**

* 当前支持 Linux（Ubuntu 16.04 及更高版本） 和 MacOS（10.14.1）。 
* 在 `python >= 3.5` 的环境中运行命令： `git` 和 `wget`，确保安装了这两个组件。

```bash
    git clone -b v0.4.1 https://github.com/Microsoft/nni.git
    cd nni  
    source install.sh 
```

参考[安装 NNI](docs/Installation.md) 了解系统需求。

**验证安装**

以下示例实验依赖于 TensorFlow 。 在运行前确保安装了 **TensorFlow**。

* 通过克隆源代码下载示例。 

```bash
    git clone -b v0.4.1 https://github.com/Microsoft/nni.git
```

* 运行 mnist 示例。

```bash
    nnictl create --config nni/examples/trials/mnist/config.yml
```

* 在命令行中等待输出 `INFO: Successfully started experiment!`。 此消息表明实验已成功启动。 通过命令行输出的 `Web UI url` 来访问实验的界面。

    ```
    INFO: Starting restful server...
    INFO: Successfully started Restful server!
    INFO: Setting local config...
    INFO: Successfully set local config!
    INFO: Starting experiment...
    INFO: Successfully started experiment!
    -----------------------------------------------------------------------
    The experiment id is egchD4qy
    The Web UI urls are: http://223.255.255.1:8080   http://127.0.0.1:8080
    -----------------------------------------------------------------------
    
    You can use these commands to get more information about the experiment
    -----------------------------------------------------------------------
             commands                       description
    
    1. nnictl experiment show        show the information of experiments
    2. nnictl trial ls               list all of trial jobs
    3. nnictl log stderr             show stderr log content
    4. nnictl log stdout             show stdout log content
    5. nnictl stop                   stop an experiment
    6. nnictl trial kill             kill a trial job by id
    7. nnictl --help                 get help information about nnictl
    -----------------------------------------------------------------------
    

* 在浏览器中打开 `Web UI url`，可看到下图的实验详细信息，以及所有的尝试任务。 查看[这里的](docs/WebUI.md)更多页面示例。

<table style="border: none">
    <th><img src="./docs/img/webui_overview_page.png" alt="logo" width="395"/></th>
    <th><img src="./docs/img/webui_trialdetail_page.png" alt="logo" width="410"/></th>
</table>

## **文档**

* [NNI 概述](docs/Overview.md)
* [快速入门](docs/GetStarted.md)

## **入门**

* [安装 NNI](docs/Installation.md)
* [使用命令行工具 nnictl](docs/NNICTLDOC.md)
* [使用 NNIBoard](docs/WebUI.md)
* [如何定义搜索空间](docs/SearchSpaceSpec.md)
* [如何定义一次尝试](docs/howto_1_WriteTrial.md)
* [配置实验](docs/ExperimentConfig.md)
* [如何使用标记](docs/howto_1_WriteTrial.md#nni-python-annotation)

## **教程**

* [在本机运行实验 (支持多 GPU 卡)](docs/tutorial_1_CR_exp_local_api.md)
* [在多机上运行实验](docs/tutorial_2_RemoteMachineMode.md)
* [在 OpenPAI 上运行实验](docs/PAIMode.md)
* [在 Kubeflow 上运行实验。](docs/KubeflowMode.md)
* [使用不同的调参器和评估器](docs/tutorial_3_tryTunersAndAssessors.md)
* [实现自定义调参器](docs/howto_2_CustomizedTuner.md)
* [实现自定义评估器](examples/assessors/README.md)
* [使用进化算法为阅读理解任务找到好模型](examples/trials/ga_squad/README.md)

## **贡献**

欢迎贡献代码或提交建议，可在 [GitHub issues](https://github.com/Microsoft/nni/issues) 跟踪需求和缺陷。

推荐新贡献者从标有 **good first issue** 的简单需求开始。

如要安装 NNI 开发环境，参考： [配置 NNI 开发环境](docs/SetupNNIDeveloperEnvironment.md)。

在写代码之前，请查看并熟悉 NNI 代码贡献指南：[贡献](docs/CONTRIBUTING.md)。

我们正在编写 [如何调试](docs/HowToDebug.md) 的页面，欢迎提交建议和问题。

## **许可协议**

整个代码库遵循 [MIT 许可协议](https://github.com/Microsoft/nni/blob/master/LICENSE)