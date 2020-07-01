TPE, Random Search, Anneal Tuners
===

## TPE

Tree-structured Parzen Estimator (TPE) 是一种 sequential model-based optimization（SMBO，即基于序列模型优化）的方法。 SMBO 方法根据历史指标数据来按顺序构造模型，来估算超参的性能，随后基于此模型来选择新的超参。 TPE 方法对 P(x|y) 和 P(y) 建模，其中 x 表示超参，y 表示相关的评估指标。 P(x|y) 通过变换超参的生成过程来建模，用非参数密度（non-parametric densities）代替配置的先验分布。 细节可参考 [Algorithms for Hyper-Parameter Optimization](https://papers.nips.cc/paper/4443-algorithms-for-hyper-parameter-optimization.pdf)。 ​

### TPE 的并行优化

为了利用多个计算节点，TPE 方法是异步运行的，这样能避免浪费时间等待 Trial 评估的完成。 对原始算法设计进行了顺序计算优化。 如果要大并发的使用 TPE，性能将会较差。 通过 Constant Liar 算法优化了这种情况。 关于优化的原理，参考[文档](../CommunitySharings/ParallelizingTpeSearch.md)。

### 用法

 要使用 TPE，需要在 Experiment 的 YAML 配置文件进行如下改动：

 ```yaml
tuner:
  builtinTunerName: TPE
  classArgs:
    optimize_mode: maximize
    parallel_optimize: True
    constant_liar_type: min
```

**classArgs 要求：**
* **optimize_mode** (*maximize or minimize, optional, default = maximize*) - If 'maximize', tuners will try to maximize metrics. 如果为 'minimize'，表示 Tuner 的目标是将指标最小化。
* **parallel_optimize** (*bool, optional, default = False*) - If True, TPE will use the Constant Liar algorithm to optimize parallel hyperparameter tuning. 否则，TPE 不会区分序列或并发的情况。
* **constant_liar_type** (*min or max or mean, optional, default = min*) - The type of constant liar to use, will logically be determined on the basis of the values taken by y at X. There are three possible values, min{Y}, max{Y}, and mean{Y}.


## Random Search（随机搜索）

[Random Search for Hyper-Parameter Optimization](http://www.jmlr.org/papers/volume13/bergstra12a/bergstra12a.pdf) 中介绍了随机搜索惊人的简单和效果。 建议在不知道超参数的先验分布时，使用随机搜索作为基准。

## Anneal（退火算法）

这种简单的退火算法从先前的采样开始，会越来越靠近发现的最佳点取样。 此算法是随机搜索的简单变体，利用了反应曲面的平滑性。 退火率不是自适应的。
