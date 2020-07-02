# 框架和库的支持
通过内置的 Python API，NNI 天然支持所有 Python (` 版本 >= 3.5`) 语言的 AI 框架，可使用所有超参调优和神经网络搜索算法。 NNI 还为常见场景提供了一些示例和教程，使上手更容易。

## 支持的 AI 框架

* <b>[PyTorch]</b> https://github.com/pytorch/pytorch
    <ul> 
      <li><a href="../../examples/trials/mnist-distributed-pytorch">MNIST-pytorch</a><br/></li>
      <li><a href="TrialExample/Cifar10Examples.md">CIFAR-10</a><br/></li>
      <li><a href="../../examples/trials/kaggle-tgs-salt/README_zh_CN.md">TGS salt identification chanllenge</a><br/></li>
      <li><a href="../../examples/trials/network_morphism/README_zh_CN.md">Network morphism</a><br/></li>
    </ul>* <b>[TensorFlow]</b> https://github.com/tensorflow/tensorflow
    <ul> 
      <li><a href="../../examples/trials/mnist-distributed">MNIST-tensorflow</a><br/></li>
       <li><a href="../../examples/trials/ga_squad/README_zh_CN.md">Squad</a><br/></li>
    </ul>* <b>[Keras]</b> https://github.com/keras-team/keras
    <ul>
      <li><a href="../../examples/trials/mnist-keras">MNIST-keras</a><br/></li>
      <li><a href="../../examples/trials/network_morphism/README_zh_CN.md">Network morphism</a><br/></li>
    </ul>* <b>[MXNet]</b> https://github.com/apache/incubator-mxnet
* <b>[Caffe2]</b> https://github.com/BVLC/caffe
* <b>[CNTK (Python language)]</b> https://github.com/microsoft/CNTK
* <b>[Spark MLlib]</b> http://spark.apache.org/mllib/
* <b>[Chainer]</b> https://chainer.org/
* <b>[Theano]</b> https://pypi.org/project/Theano/ <br/>

如果能[贡献更多示例](Tutorial/Contributing.md)，会对其他 NNI 用户有很大的帮助。

## 支持的库
NNI 支持所有基于 Python 的库。Here are some common libraries, including some algorithms based on GBDT: XGBoost, CatBoost and lightGBM.
* <b>[Scikit-learn]</b> https://scikit-learn.org/stable/
    <ul>
    <li><a href="TrialExample/SklearnExamples.md">Scikit-learn</a><br/></li>
    </ul>* <b>[XGBoost]</b> https://xgboost.readthedocs.io/en/latest/
* <b>[CatBoost]</b> https://catboost.ai/
* <b>[LightGBM]</b> https://lightgbm.readthedocs.io/en/latest/
    <ul>
    <li><a href="TrialExample/GbdtExample.md">Auto-gbdt</a><br/></li>
    </ul>
这只是 NNI 支持的一小部分库。 如果对 NNI 感兴趣，可参考[教程](TrialExample/Trials.md)来继续学习。



除了这些案例，也欢迎更多的用户将 NNI 应用到自己的工作中，如果有任何疑问，请参考[实现 Trial](TrialExample/Trials.md)。 In particular, if you want to be a contributor of NNI, whether it is the sharing of examples , writing of Tuner or otherwise, we are all looking forward to your participation.More information please refer to [here](Tutorial/Contributing.md).
