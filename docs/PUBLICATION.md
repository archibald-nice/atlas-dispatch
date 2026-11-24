# Atlas 公开发行边界

**Atlas 现在仅供私人本地使用。** `npm run release -- export` 只生成一份可以核对的免费对外候选，不会上传或授权发布，也不是付费版。

## 代码和数据不是一种许可

- [项目声明](../package.json) 为 `private: true`、`UNLICENSED`。将来若权利人决定开放，推荐 **Apache-2.0 仅用于经筛查的第一方代码**：允许商业使用并提供明确的专利条款，不授权产品品牌、第三方依赖、信源内容、快照或编辑材料。
- **不把现有 Git 仓库直接转公开。** 历史已包含本地快照、编辑覆盖和验证证据。将来另建经过审查的源码树，去掉不适合分发的文件和历史，单独处理内容包。选择代码许可证也不代表批准发布数据。

## 能进入免费候选的内容

| 信源 | 候选保留 | 条款与限制 |
| --- | --- | --- |
| [USGS](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | 官方结构化事件标题、实际记录的时间与震中坐标、USGS 链接。 | USGS 创作或产出的美国公有领域数据可再分发，第三方材料除外。署名，不从震级推断伤亡、破坏或影响范围。 |
| [美联储理事会](https://www.federalreserve.gov/disclaimer.htm) | 通用标签、日期、官方新闻稿链接、署名；发布机构位置。 | 理事会网站信息除特殊标注外可再分发，第三方材料与徽标除外；本候选仅链接，不转载标题、摘要、正文或嵌入网站。 |
| [欧洲央行](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html) | 通用标签、日期、官方链接、署名；法兰克福发布机构位置。 | 再用须准确、署名并标注修改；复制署名作品可能须书面授权。出售含 ECB 信息的材料时，须在付费前和每次访问时提示信息可免费获取。本候选仅链接，不把资料作为可付费再分发的内容。 |
| [arXiv](https://info.arxiv.org/help/api/tou.html) | 题录标题、日期、官方摘要页链接，保留预印本说明。 | 描述性元数据适用 CC0；论文内容另有版权。不随包分发摘要正文、PDF、源码或全文，不暗示背书。采集仍受 API 限速约束。 |
| [NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/) | 通用标签、日期、署名、允许的官方报道页面链接。 | 外部权利、标识、可识别人物和商业用途有额外限制。这里不转载标题、摘要、正文、图片或徽标，不分发从正文推导的地点，不暗示 NASA 背书。 |
| [Google Gemma 文档](https://github.com/google-gemma/docs/blob/main/LICENSE) | 通用发布标签、官方短摘录和发布日期、文档链接、修改与许可说明。 | 文档源码适用 Apache-2.0，附归属、修改说明和完整许可。不是模型权重许可证；不打包权重、图片或完整文档。 |

美联储和欧洲央行的坐标表示**发布机构**所在地，不是事件发生地或政策影响范围。「仅链接」是本项目保守的分发规则，不是对来源许可作更宽泛的判断。

## 怎样准备并复核

1. 先启用本地版；保持当前代码与该版记录的 Git 提交一致。运行 `npm run release -- export`，打开 `releases/exports/<导出编号>/`。
2. 目录只应有 `index.html`、`THIRD_PARTY_NOTICES.txt` 和 `manifest.json`。用清单核对每源的保留数、排除数和方式。离线打开 HTML，抽查仅链接源不出现原标题或摘录，Gemma 的原始许可证与修改说明可读。
3. 对外前重新核对条款及实际条目。若有人申请公开源码、上线或收费，分别确认代码授权、内容范围、署名义务和外发授权；不要把本命令的成功当成以上任何一项批准。

[`public-content.mjs`](../scripts/public-content.mjs) 只接受经过核对的信源身份和官方文章主机／路径；未知信源、改过的来源地址或不合规的文章链接不会放进候选。它重建对外字段、重新计算条数，移除原始错误、URL 查询参数和无关字段；不会复制私有快照、编辑覆盖、源码、开发入口、日志或验证证据。

**核查证据：** 已读取 Fed、ECB、arXiv、NASA 的官方条款；Gemma 的 [原始许可证](https://raw.githubusercontent.com/google-gemma/docs/main/LICENSE) 与[本地记录](../verification/model-source.json)一致。所查 Gemma `NOTICE` 路径返回 404，不代表仓库无其他归属信息。USGS 使用了官方政策的索引摘要，并直接核对了 [GeoJSON 接口](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)；完整政策页的直接读取返回 HTTP 405，对外前须补核。
