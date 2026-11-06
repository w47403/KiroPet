# KiroPet 第三方动画与形象署名

## 本项目使用了哪些资源

KiroPet 当前使用的 **全部 95 个动画均直接导入自 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)**，不是 KiroPet 原创动画。该项目声明，其中大部分动画来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。请同时保留这两个项目的来源署名。

- 导入提交：`b61b445e6be05a732fc6738b825240aeffdf6769`。
- 原资源路径：直接来源仓库的 `assets/thumb/<分类>/<动作>.webm`。
- 本地路径：`assets/animations/dsh/`、`assets/animations/tk/`。
- 衍生图片：`assets/whale-girl.png`、`assets/icon.png`、`assets/moods/` 及 README 中的动画帧预览，也来自这些素材。
- 转换内容：透明视频解码为 PNG、统一完整画布与缩放、生成不同尺寸；保留完整源帧和时序，未因此取得或重新授予动画版权。
- 逐动作来源、原视频 SHA-256、帧数与帧率记录在 [`assets/animations/manifest.json`](https://github.com/w47403/KiroPet/blob/main/assets/animations/manifest.json)。

## 授权边界

本仓库原创插件代码沿用 MIT License。**该 MIT 授权不覆盖第三方动画、角色形象及其衍生图片。**

上游素材说明允许用于开源项目，禁止商业使用，并要求衍生作品在公开渠道附上原作者地址：[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。素材的复制、修改、分发与使用必须继续遵守上游条款，不可仅引用 KiroPet 的 MIT License。

根据上游 README 的形象署名：原型「溟月」来自 B 站 [@上善无形](https://space.bilibili.com/4456176)，DeepSeek 版女仆鲸鱼娘设计来自 [@ZipZipPipe](https://space.bilibili.com/4168597)。形象为社区二创、非 DeepSeek 官方形象；上游声明其采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)，须保留署名、非商业及相同方式共享条件。参见 [上游许可章节](https://github.com/PC2005-cloud/dsh-pet#许可) 与其引用的 [形象授权声明](https://www.bilibili.com/opus/1247156596114456581)。

KiroPet 不代表原作者授予额外权利。请以具体资源及权利人的原始授权为准；商业用途须另行取得相关权利人的明确授权。

## 直接来源项目的原始资源说明

下方保留导入版本的原始说明。**下文中的“本项目”和 `assets/thumb/` 均指 dsh-whale-pet，而非 KiroPet。**

---

# 第三方资源许可说明

[English](https://github.com/luweiyabo/dsh-whale-pet/blob/main/THIRD_PARTY_ASSETS_EN.md)

## 适用范围

本项目的原创源代码使用仓库根目录 [LICENSE](https://github.com/luweiyabo/dsh-whale-pet/blob/main/LICENSE) 中的 MIT License。
该 MIT 授权不适用于 `assets/thumb/` 中实际从上游项目取得的动画媒体资源。
该目录也包含本项目制作的动画；本说明中的上游资源条款仅适用于取自上游的部分。

## 动画资源

- 来源：[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)
- 上游资源路径：`assets/thumb/`
- 本项目资源路径：`assets/thumb/`（其中的大部分动画）
- 上游作者：PC2005-cloud/dsh-pet contributors

截至本项目发布准备时，上游 README 对动画、提示词及源视频等资源声明：允许在
开源项目中使用，但禁止商业使用。因此，这些动画资源不是由本项目以 MIT License
重新授权；复制、分发、修改或使用这些资源时，必须同时遵守上游的资源条款并保留
来源署名。

上游条款可能发生变化。使用前请核对：

- [上游 README（资源许可说明）](https://github.com/PC2005-cloud/dsh-pet#license)
- [上游 LICENSE](https://github.com/PC2005-cloud/dsh-pet/blob/main/LICENSE)

如需商业使用，请在使用前联系上游权利人取得明确授权。若不接受上述媒体资源条款，
请勿复制、分发或使用 `assets/thumb/` 中的动画文件。

本包为混合授权：原创源代码以 MIT License 授权，而 `assets/thumb/` 中的大部分动画
来自上游项目，受单独的禁商用资源条款约束。该条款仅适用于实际取自上游项目的动画。
