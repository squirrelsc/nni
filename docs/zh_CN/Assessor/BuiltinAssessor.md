# 内置 Assessor

NNI 提供了先进的评估算法，使用上也很简单。 下面是内置 Assessor 的介绍。

Note: Click the **Assessor's name** to get each Assessor's installation requirements, suggested usage scenario, and a config example. 在每个 Assessor 建议场景最后，还有算法的详细说明。

当前支持以下 Assessor：

| Assessor                          | 算法简介                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [__Medianstop__](#MedianStop)     | Medianstop 是一个简单的提前终止算法。 It stops a pending trial X at step S if the trial’s best objective value by step S is strictly worse than the median value of the running averages of all completed trials’ objectives reported up to step S. [Reference Paper](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/46180.pdf) |
| [__Curvefitting__](#Curvefitting) | Curve Fitting Assessor 是一个 LPA (learning, predicting, assessing，即学习、预测、评估) 的算法。 如果预测的 Trial X 在 step S 比性能最好的 Trial 要差，就会提前终止它。 此算法中采用了 12 种曲线来拟合精度曲线。 [参考论文](http://aad.informatik.uni-freiburg.de/papers/15-IJCAI-Extrapolation_of_Learning_Curves.pdf)                                                                                           |

## 用法

Usage of builtin assessors provided by the NNI SDK requires one to declare the  **builtinAssessorName** and **classArgs** in the `config.yml` file. 这一节会介绍推荐的场景、参数等详细用法以及示例。

注意：参考示例中的格式来创建新的 `config.yml` 文件。

<a name="MedianStop"></a>

### Median Stop Assessor

> Builtin Assessor Name: **Medianstop**

**建议场景**

适用于各种性能曲线，可用到各种场景中来加速优化过程。 [详细说明](./MedianstopAssessor.md)

**classArgs 要求：**

* **optimize_mode** (*maximize or minimize, optional, default = maximize*) - If 'maximize', assessor will **stop** the trial with smaller expectation. If 'minimize', assessor will **stop** the trial with larger expectation.
* **start_step** (*int, optional, default = 0*) - A trial is determined to be stopped or not only after receiving start_step number of reported intermediate results.

**使用示例：**

```yaml
# config.yml
assessor:
    builtinAssessorName: Medianstop
    classArgs:
      optimize_mode: maximize
      start_step: 5
```

<br>

<a name="Curvefitting"></a>

### Curve Fitting Assessor

> Builtin Assessor Name: **Curvefitting**

**建议场景**

适用于各种性能曲线，可用到各种场景中来加速优化过程。 更好的是，它能够处理并评估性能类似的曲线。 [详细说明](./CurvefittingAssessor.md)

**Note**, according to the original paper, only incremental functions are supported. 因此，此 Assessor 仅可用于最大化优化指标的场景。 例如，它可用于准确度，但不能用于损失值。


**classArgs 要求：**

* **epoch_num** (***int, ***required******) - The total number of epochs. 需要此数据来决定需要预测点的总数。
* **start_step** (*int, optional, default = 6*) - A trial is determined to be stopped or not only after receiving start_step number of reported intermediate results.
* **threshold** (*float, optional, default = 0.95*) - The threshold that we use to decide to early stop the worst performance curve. 例如，如果 threshold = 0.95，最好的历史结果是 0.9，那么会在 Trial 的预测值低于 0.95 * 0.9 = 0.855 时停止。
* **gap** (*int, optional, default = 1*) - The gap interval between Assessor judgements. 例如：如果 gap = 2, start_step = 6，就会评估第 6, 8, 10, 12... 个中间结果。

**使用示例：**

```yaml
# config.yml
assessor:
    builtinAssessorName: Curvefitting
    classArgs:
      epoch_num: 20
      start_step: 6
      threshold: 0.95
      gap: 1
```
