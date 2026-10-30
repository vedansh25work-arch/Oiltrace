import segmentation_models_pytorch as smp


class UNet:
    def __new__(cls):
        return smp.Unet(
            encoder_name="resnet34",
            encoder_weights="imagenet",
            in_channels=3,
            classes=1,
        )