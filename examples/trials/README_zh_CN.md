# 如何在 NNI 中实现 Trial 的代码？

*Trial 从 Tuner 中接收超参和架构配置，并将中间结果发送给 Assessor，最终结果发送给Tuner 。*

当用户需要在 NNI 上运行 Trial 时，需要：

**1)Have an original Trial could run**,

Trial 的代码可以是任何能在本机运行的机器学习代码。 这里使用 `mnist-keras. py` 作为示例：

```python
import argparse
import logging
import keras
import numpy as np
from keras import backend as K
from keras.datasets import mnist
from keras.layers import Conv2D, Dense, Flatten, MaxPooling2D
from keras.models import Sequential

K.set_image_data_format('channels_last')

H, W = 28, 28
NUM_CLASSES = 10

def create_mnist_model(hyper_params, input_shape=(H, W, 1), num_classes=NUM_CLASSES):
    layers = [
        Conv2D(32, kernel_size=(3, 3), activation='relu', input_shape=input_shape),
        Conv2D(64, (3, 3), activation='relu'),
        MaxPooling2D(pool_size=(2, 2)),
        Flatten(),
        Dense(100, activation='relu'),
        Dense(num_classes, activation='softmax')
    ]

    model = Sequential(layers)

    if hyper_params['optimizer'] == 'Adam':
        optimizer = keras.optimizers.Adam(lr=hyper_params['learning_rate'])
    else:
        optimizer = keras.optimizers.SGD(lr=hyper_params['learning_rate'], momentum=0.9)
    model.compile(loss=keras.losses.categorical_crossentropy, optimizer=optimizer, metrics=['accuracy'])

    return model

def load_mnist_data(args):
    (x_train, y_train), (x_test, y_test) = mnist.load_data()

    x_train = (np.expand_dims(x_train, -1).astype(np.float) / 255.)[:args.num_train]
    x_test = (np.expand_dims(x_test, -1).astype(np.float) / 255.)[:args.num_test]
    y_train = keras.utils.to_categorical(y_train, NUM_CLASSES)[:args.num_train]
    y_test = keras.utils.to_categorical(y_test, NUM_CLASSES)[:args.num_test]

    return x_train, y_train, x_test, y_test

class SendMetrics(keras.callbacks.Callback):
    def on_epoch_end(self, epoch, logs={}):
        pass

def train(args, params):
    x_train, y_train, x_test, y_test = load_mnist_data(args)
    model = create_mnist_model(params)

    model.fit(x_train, y_train, batch_size=args.batch_size, epochs=args.epochs, verbose=1,
        validation_data=(x_test, y_test), callbacks=[SendMetrics()])

    _, acc = model.evaluate(x_test, y_test, verbose=0)

def generate_default_params():
    return {
        'optimizer': 'Adam',
        'learning_rate': 0.001
    }

if __name__ == '__main__':
    PARSER = argparse.ArgumentParser()
    PARSER.add_argument("--batch_size", type=int, default=200, help="batch size", required=False)
    PARSER.add_argument("--epochs", type=int, default=10, help="Train epochs", required=False)
    PARSER.add_argument("--num_train", type=int, default=1000, help="Number of train samples to be used, maximum 60000", required=False)
    PARSER.add_argument("--num_test", type=int, default=1000, help="Number of test samples to be used, maximum 10000", required=False)

    ARGS, UNKNOWN = PARSER.parse_known_args()
    PARAMS = generate_default_params()
    train(ARGS, PARAMS)
```

**2) 从 Tuner 获取配置**

导入 `NNI` 并用 `nni.get_next_parameter()` 来接收参数。 Please noted **10**, **24** and **25** line in the following code.


```python
import argparse
import logging
import keras
import numpy as np
from keras import backend as K
from keras.datasets import mnist
from keras.layers import Conv2D, Dense, Flatten, MaxPooling2D
from keras.models import Sequential

import nni

...

if __name__ == '__main__':
    PARSER = argparse.ArgumentParser()
    PARSER.add_argument("--batch_size", type=int, default=200, help="batch size", required=False)
    PARSER.add_argument("--epochs", type=int, default=10, help="Train epochs", required=False)
    PARSER.add_argument("--num_train", type=int, default=1000, help="Number of train samples to be used, maximum 60000", required=False)
    PARSER.add_argument("--num_test", type=int, default=1000, help="Number of test samples to be used, maximum 10000", required=False)

    ARGS, UNKNOWN = PARSER.parse_known_args()

    PARAMS = generate_default_params()
    RECEIVED_PARAMS = nni.get_next_parameter()
    PARAMS.update(RECEIVED_PARAMS)
    train(ARGS, PARAMS)
```


**3)  发送中间结果**

用 `nni.report_intermediate_result` 将中间结果发送给 Assessor。 Please noted **5** line in the following code.


```python
...

class SendMetrics(keras.callbacks.Callback):
    def on_epoch_end(self, epoch, logs={}):
        nni.report_intermediate_result(logs)

def train(args, params):
    x_train, y_train, x_test, y_test = load_mnist_data(args)
    model = create_mnist_model(params)

    model.fit(x_train, y_train, batch_size=args.batch_size, epochs=args.epochs, verbose=1,
        validation_data=(x_test, y_test), callbacks=[SendMetrics()])

    _, acc = model.evaluate(x_test, y_test, verbose=0)

...
```
**4) 发送最终结果**

用 `nni.report_final_result` 将最终结果发送给 Tuner。 Please noted **15** line in the following code.

```python
...

class SendMetrics(keras.callbacks.Callback):
    def on_epoch_end(self, epoch, logs={}):
        nni.report_intermediate_result(logs)

def train(args, params):
    x_train, y_train, x_test, y_test = load_mnist_data(args)
    model = create_mnist_model(params)

    model.fit(x_train, y_train, batch_size=args.batch_size, epochs=args.epochs, verbose=1,
        validation_data=(x_test, y_test), callbacks=[SendMetrics()])

    _, acc = model.evaluate(x_test, y_test, verbose=0)
    nni.report_final_result(acc)
...
```

这是完整示例：


```python
import argparse
import logging

import keras
import numpy as np
from keras import backend as K
from keras.datasets import mnist
from keras.layers import Conv2D, Dense, Flatten, MaxPooling2D
from keras.models import Sequential

import nni

LOG = logging.getLogger('mnist_keras')
K.set_image_data_format('channels_last')

H, W = 28, 28
NUM_CLASSES = 10

def create_mnist_model(hyper_params, input_shape=(H, W, 1), num_classes=NUM_CLASSES):
    '''
    Create simple convolutional model
    '''
    layers = [
        Conv2D(32, kernel_size=(3, 3), activation='relu', input_shape=input_shape),
        Conv2D(64, (3, 3), activation='relu'),
        MaxPooling2D(pool_size=(2, 2)),
        Flatten(),
        Dense(100, activation='relu'),
        Dense(num_classes, activation='softmax')
    ]

    model = Sequential(layers)

    if hyper_params['optimizer'] == 'Adam':
        optimizer = keras.optimizers.Adam(lr=hyper_params['learning_rate'])
    else:
        optimizer = keras.optimizers.SGD(lr=hyper_params['learning_rate'], momentum=0.9)
    model.compile(loss=keras.losses.categorical_crossentropy, optimizer=optimizer, metrics=['accuracy'])

    return model

def load_mnist_data(args):
    '''
    Load MNIST dataset
    '''
    (x_train, y_train), (x_test, y_test) = mnist.load_data()

    x_train = (np.expand_dims(x_train, -1).astype(np.float) / 255.)[:args.num_train]
    x_test = (np.expand_dims(x_test, -1).astype(np.float) / 255.)[:args.num_test]
    y_train = keras.utils.to_categorical(y_train, NUM_CLASSES)[:args.num_train]
    y_test = keras.utils.to_categorical(y_test, NUM_CLASSES)[:args.num_test]

    LOG.debug('x_train shape: %s', (x_train.shape,))
    LOG.debug('x_test shape: %s', (x_test.shape,))

    return x_train, y_train, x_test, y_test

class SendMetrics(keras.callbacks.Callback):
    '''
    Keras callback to send metrics to NNI framework
    '''
    def on_epoch_end(self, epoch, logs={}):
        '''
        Run on end of each epoch
        '''
        LOG.debug(logs)
        nni.report_intermediate_result(logs)

def train(args, params):
    '''
    Train model
    '''
    x_train, y_train, x_test, y_test = load_mnist_data(args)
    model = create_mnist_model(params)

    model.fit(x_train, y_train, batch_size=args.batch_size, epochs=args.epochs, verbose=1,
        validation_data=(x_test, y_test), callbacks=[SendMetrics()])

    _, acc = model.evaluate(x_test, y_test, verbose=0)
    LOG.debug('Final result is: %d', acc)
    nni.report_final_result(acc)

def generate_default_params():
    '''
    Generate default hyper parameters
    '''
    return {
        'optimizer': 'Adam',
        'learning_rate': 0.001
    }

if __name__ == '__main__':
    PARSER = argparse.ArgumentParser()
    PARSER.add_argument("--batch_size", type=int, default=200, help="batch size", required=False)
    PARSER.add_argument("--epochs", type=int, default=10, help="Train epochs", required=False)
    PARSER.add_argument("--num_train", type=int, default=1000, help="Number of train samples to be used, maximum 60000", required=False)
    PARSER.add_argument("--num_test", type=int, default=1000, help="Number of test samples to be used, maximum 10000", required=False)

    ARGS, UNKNOWN = PARSER.parse_known_args()

    try:
        # get parameters from tuner
        RECEIVED_PARAMS = nni.get_next_parameter()
        LOG.debug(RECEIVED_PARAMS)
        PARAMS = generate_default_params()
        PARAMS.update(RECEIVED_PARAMS)
        # train
        train(ARGS, PARAMS)
    except Exception as e:
        LOG.exception(e)
        raise

```
