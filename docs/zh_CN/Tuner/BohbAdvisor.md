NNI 中的 BOHB Advisor
===

## 1. 介绍
BOHB 是由[此篇论文](https://arxiv.org/abs/1807.01774)提出的一种高效而稳定的调参算法。 BO 是贝叶斯优化（Bayesian Optimization）的缩写，HB 是 Hyperband 算法的缩写。

BOHB relies on HB (Hyperband) to determine how many configurations to evaluate with which budget, but it **replaces the random selection of configurations at the beginning of each HB iteration by a model-based search (Bayesian Optimization)**. 一旦贝叶斯优化生成的参数达到迭代所需的配置数, 就会使用这些配置开始执行标准的连续减半过程（successive halving）。 观察这些参数在不同资源配置（budget）下的表现 g(x, b)，用于在以后的迭代中用作我们贝叶斯优化模型选择参数的基准数据。

接下来分两部分来介绍 BOHB 过程涉及的原理:

### HB（Hyperband）

按照 Hyperband 的方式来选择资源（budget），并继续使用 "连续减半（SuccessiveHalving）" 策略。 更多细节，参考 [NNI 中的 Hyperband](HyperbandAdvisor.md) 和 [Hyperband 的参考论文](https://arxiv.org/abs/1603.06560)。 下面的伪代码描述了这个过程。

![](../../img/bohb_1.png)

### BO（贝叶斯优化）

BOHB 的 BO 与 TPE 非常相似, 它们的主要区别是: BOHB 中使用一个多维的 KDE, 而不是 TPE 那样带有权重的一维 KDEs, 以便更好地处理搜索空间中超参之间的互相影响。

树形超参评估器 (TPE): 使用 KDE (核密度估计) 来对密度进行建模。

![](../../img/bohb_2.png)

为了建模有效的核密度估计（KDE），设置了一个建立模型所需的最小观察点数（Nmin），在 Experiment 中它的默认值为 d+1（d是搜索空间的维度），其中 d 也是一个可以设置的超参数。 To build a model as early as possible, we do not wait until Nb = |Db|, where the number of observations for budget b is large enough to satisfy q · Nb ≥ Nmin. Instead, after initializing with Nmin + 2 random configurations, we choose the

![](../../img/bohb_3.png)

按照公式将观察到的点分成好与坏两类点，来分别拟合两个不同的密度分布。

Note that we also sample a constant fraction named **random fraction** of the configurations uniformly at random.

## 2. 流程

![](../../img/bohb_6.jpg)

以上这张图展示了 BOHB 的工作流程。 将每次训练的最大资源配置（max_budget）设为 9，最小资源配置设为（min_budget）1，逐次减半比例（eta）设为 3，其他的超参数为默认值。 那么在这个例子中，s_max 计算的值为 2, 所以会持续地进行 {s=2, s=1, s=0, s=2, s=1, s=0, ...} 的循环。 在“逐次减半”（SuccessiveHalving）算法的每一个阶段，即图中橙色框，都将选取表现最好的前 1/eta 个参数，并在赋予更多计算资源（budget）的情况下运行。不断重复“逐次减半” （SuccessiveHalving）过程，直到这个循环结束。 同时，收集这些试验的超参数组合，使用了计算资源（budget）和其表现（metrics），使用这些数据来建立一个以使用了多少计算资源（budget）为维度的多维核密度估计（KDE）模型。 这个多维的核密度估计（KDE）模型将用于指导下一个循环的参数选择。

有关如何使用多维的 KDE 模型来指导参数选择的采样规程，用以下伪代码来描述。

![](../../img/bohb_4.png)

## 3. 用法

BOHB Advisor 需要 [ConfigSpace](https://github.com/automl/ConfigSpace) 包。 可以使用以下命令安装 ConfigSpace。

```bash
nnictl package install --name=SMAC
```

要使用 BOHB，需要在 Experiment 的 YAML 配置文件进行如下改动：

```yaml
advisor:
  builtinAdvisorName: BOHB
  classArgs:
    optimize_mode: maximize
    min_budget: 1
    max_budget: 27
    eta: 3
    min_points_in_model: 7
    top_n_percent: 15
    num_samples: 64
    random_fraction: 0.33
    bandwidth_factor: 3.0
    min_bandwidth: 0.001
```

**classArgs 要求：**

* **optimize_mode** (*maximize or minimize, optional, default = maximize*) - If 'maximize', tuners will try to maximize metrics. 如果为 'minimize'，表示 Tuner 的目标是将指标最小化。
* **min_budget** (*int, optional, default = 1*) - The smallest budget to assign to a trial job, (budget can be the number of mini-batches or epochs). 该参数必须为正数。
* **max_budget** (*int, optional, default = 3*) - The largest budget to assign to a trial job, (budget can be the number of mini-batches or epochs). 该参数必须大于“min_budget”。
* **eta** (*int, optional, default = 3*) - In each iteration, a complete run of sequential halving is executed. 在这里，当一个使用相同计算资源的子集结束后，选择表现前 1/eta 好的参数，给予更高的优先级，进入下一轮比较（会获得更多计算资源）。 该参数必须大于等于 2。
* **min_points_in_model**(*int, optional, default = None*): number of observations to start building a KDE. 默认值 None 表示 dim+1，当在该计算资源（budget）下试验过的参数已经大于等于`max{dim+1, min_points_in_model}` 时，BOHB 将会开始建立这个计算资源（budget）下对应的核密度估计（KDE）模型，然后用这个模型来指导参数的选取。 该参数必须为正数。 (dim 表示搜索空间中超参的数量)
* **top_n_percent**(*int, optional, default = 15*): percentage (between 1 and 99) of the observations which are considered good. 区分表现好的点与坏的点是为了建立树形核密度估计模型。 例如，如果有 100 个观察到的 Trial，top_n_percent 为 15，则前 15% 的点将用于构建好点模型 "l(x)"。 其余 85% 的点将用于构建坏点模型 "g(x)"。
* **num_samples**(*int, optional, default = 64*): number of samples to optimize EI (default 64). 在这种情况下，将对 "num_samples" 点进行采样，并比较 l(x)/g(x) 的结果。 然后，如果 optimize_mode 是 `maximize`，就会返回其中 l(x)/g(x) 值最大的点作为下一个配置参数。 否则，使用值最小的点。
* **random_fraction**(*float, optional, default = 0.33*): fraction of purely random configurations that are sampled from the prior without the model.
* **bandwidth_factor**(*float, optional, default = 3.0*): to encourage diversity, the points proposed to optimize EI are sampled from a 'widened' KDE where the bandwidth is multiplied by this factor. 如果不熟悉 KDE，建议使用默认值。
* **min_bandwidth**(*float, optional, default = 0.001*): to keep diversity, even when all (good) samples have the same value for one of the parameters, a minimum bandwidth (default: 1e-3) is used instead of zero. 如果不熟悉 KDE，建议使用默认值。

*请注意，浮点类型当前仅支持十进制表示。 必须使用 0.333 而不是 1/3 ，0.001 而不是 1e-3。*

## 4. 文件结构
Advisor 有大量的文件、函数和类。 这里只简单介绍最重要的文件：

* `bohb_advisor.py` BOHB 类的定义, 包括与 Dispatcher 进行交互的部分，以及控制新 Trial 的生成，计算资源以及结果的处理。 还包含了 HB（Hyperband）的实现部分。
* `config_generator.py` 包含了 BO（贝叶斯优化）算法的实现。 The function *get_config* can generate new configurations based on BO; the function *new_result* will update the model with the new result.

## 5. 实验

### BOHB 在 MNIST 数据集上的表现

源码地址： [examples/trials/mnist-advisor](https://github.com/Microsoft/nni/tree/master/examples/trials/)

使用 BOHB 调参算法，在 CNN 模型上跑 MNIST 数据集。 下面是实验结果：

![](../../img/bohb_5.png)

更多实验结果可以在[参考文献](https://arxiv.org/abs/1807.01774)中找到。 可以看到，BOHB 充分利用了以往的成果，在探索和挖掘方面有很好的平衡。