# 晨报 · Morning Brief

每天早上自动生成一份**中英对照的个人晨报**：要点式、带重点标注、配真实图片和来源。内容由你的 Claude 云端定时任务每天研究、核实后写好，Mac 上的「晨报」App 自动下载显示。

主题由你自己定：犯罪学、AI 与 SEO，或者任何你关心的领域。

---

## 你需要准备

- 一台 Mac（macOS 14 或更新）
- 一个 GitHub 账号（免费）
- 一个 Claude 账号（Pro 或更高；云端任务会用你自己的额度）

整个设置大约 15 分钟。

## 第 1 步：安装 App

1. 打开这个仓库的 **Releases**（右侧栏），下载最新的 `MorningBrief-x.y.zip`。
2. 解压，把「晨报.app」拖进「应用程序」文件夹。
3. 第一次打开时 macOS 会提示「无法验证开发者」：打开 **系统设置 ▸ 隐私与安全性**，往下找到「晨报」，点 **仍要打开**。只需要做一次。

以后有新版本，App 会提示你，也可以在菜单 **晨报 ▸ Check for Updates… 检查更新** 里手动检查，点「安装并重启」即可。

## 第 2 步：建你自己的仓库

1. 在这个页面右上角点 **Use this template ▸ Create a new repository**。
2. 名字随意（比如 `my-morning-brief`）。选 **Public** 最省事；想让内容只有自己看到就选 **Private**，再按下面「想把仓库设为私有？」加一个只读令牌。
3. 点 **Create repository**。

## 第 3 步：设定你的主题（`profile.json`）

1. 在你的新仓库里打开 `profiles/`，挑一个最接近的预设：
   - `ai-seo.json`：AI 行业动态、AI 搜索与 SEO、品牌营销（没有学术栏目）
   - `criminology.json`：犯罪学与司法（含家庭暴力追踪专栏、学术动态）
   - `blank.json`：空白，从零开始
2. 复制它的全部内容，打开仓库根目录的 `profile.json`，点 ✏️ 编辑，全部替换后按需修改：

| 字段 | 改什么 |
|---|---|
| `reader` | 你是谁、想看什么（中英文）。云端任务按这个写稿，写得越具体越好。 |
| `name` | 报头下的副标题，例如 "AI & Search Brief"。 |
| `time_zone` | 你所在的时区，例如 `Asia/Shanghai`、`Australia/Sydney`、`America/Los_Angeles`。 |
| `scopes` | 地区优先级（最多 3 个），第一个最重要。 |
| `categories` | 分类标签。 |
| `concepts` | 你领域里的概念或理论。 |
| `sections` | 栏目开关：`academic`（学术）、`followups`（跟进）、`focus`（个人专栏）、`data`（数据）、`live`（实时）、`learning`（每日新知与 Takeaway）。不要的设为 `false`。 |
| `focus` | 你的个人专栏，可以是一个，也可以写成数组放好几个（见下方「多个专栏」）。每个专栏：`id`、`title` 名字、`subtitle` 追踪什么、`term_groups` 关键词（条目要同时命中每一组中的至少一个词）、可选的 `color` 颜色、`icon` 图标和 `themes` 主题卡片。 |
| `feeds` | 新闻源（RSS）。屏蔽阅读器的网站可以用 Google 新闻：`https://news.google.com/rss/search?q=site:网站域名`。 |

3. 点 **Commit changes** 保存。

> 例子：做 AI SEO 创业的朋友，用 `ai-seo.json`，把 `focus.subtitle` 改成自己的产品，`feeds` 里加上竞品的博客，`time_zone` 改成自己的城市。

### 多个专栏

同时关注几个互不相关的方向时，把 `focus` 写成数组，每个方向一个专栏。App 会给每个专栏单独的侧边栏入口、页面和颜色，云端任务也会分别写进 `research/focus-<id>-日期.json`：

```json
"focus": [
  { "id": "store", "title": {"en": "Store Watch", "zh": "网店追踪"},
    "subtitle": {"en": "My online shop", "zh": "我的网店"},
    "term_groups": [["shopify", "ecommerce", "电商"]],
    "color": "teal", "icon": "cart",
    "themes": [{"id": "marketing", "label": {"en": "Marketing", "zh": "营销"}, "icon": "megaphone"}] },
  { "id": "software", "title": {"en": "Software Watch", "zh": "软件项目追踪"},
    "subtitle": {"en": "AI SEO software", "zh": "AI SEO 软件"},
    "term_groups": [["seo", "ai search"], ["ai", "llm"]],
    "color": "indigo", "icon": "sparkle.magnifyingglass" }
]
```

- `color`：orange、indigo、teal、pink、green、blue、purple、red，或 `#RRGGBB`。
- `icon`：Mac 的 SF Symbols 图标名，例如 `cart`、`chart.line.uptrend.xyaxis`、`book`。
- `themes`：专栏顶部的主题卡片（每张显示条目数）。不写就不显示卡片。
- 原来只写一个 `focus` 对象也照样能用，不用改。
- 在 App 的「设置 ▸ 主题」里可以给专栏排序、隐藏某个专栏，以及修改每个专栏的关键词。

## 第 4 步：让 Claude 每天写晨报

1. **授权 GitHub**：打开 <https://github.com/apps/claude> ▸ **Install** ▸ **Only select repositories** ▸ 选你的仓库。
2. **建定时任务**：打开 <https://claude.ai/code/routines> ▸ **New routine**：
   - **Repository**：你的仓库
   - **Schedule**：每天早上你想要的时间（例如每天 6:00）
   - **Prompt**：复制下面这段
     ```
     Read TASK.md and profile.json in this repository and follow TASK.md exactly to write today's Morning Brief. Verify every source you use, write bilingual {en, zh} text, use real images only, never log in to subscription sites, validate with tools/validate.py, rebuild index.json, then commit and push to main. Finish with a short summary.
     ```
   - **Model**：Claude Sonnet（默认即可）
3. **放开网络**：创建后打开任意一次运行，点顶部标题旁的 **⌄ ▸ Edit cloud environment**，把 **Network access** 改成 **Full**，保存。（默认的 Trusted 会拦住新闻网站，晨报会生成失败。）
4. 点 **Run now** 试跑一次，20–40 分钟后仓库里会出现 `briefs/今天日期.json`。

## 第 5 步：把 App 连上你的仓库

打开「晨报」▸ **设置**（⌘,）：

- **Sync 同步** ▸ Cloud brief：填 `你的GitHub用户名/仓库名`，点「立即同步」。
- **General 通用** ▸ 你的名字：报头会显示「你的名字的晨报」。
- **Topic 主题**：保持「云端仓库有 profile.json 时优先使用」打开，App 的栏目就会和你的 `profile.json` 一致。

## 多台 Mac

在 **Sync 同步** 里打开「同步我的阅读数据」，选同步方式：**OneDrive**（默认，用你的个人 OneDrive）、**iCloud 云盘**，或任意网盘文件夹（Dropbox、Google Drive 等）。使用同一个网盘账户的 Mac 会自动同步已读、收藏、标签、笔记和设置，不需要另外注册账号。简报本身每台 Mac 都从你的仓库下载。

## 在 App 里改设置，Claude 马上更新

设置 ▸ 主题 里可以直接改：专栏（名称、关键词、主题卡片、颜色、图标，新建 / 删除）和主题设置（晨报名称、「我是谁 / 想看什么」、栏目开关、地区、分类、概念、新闻源、实时关键词）。点「保存并同步到仓库」后，App 会把 `profile.json` 提交到你的仓库。

想让 Claude **改完马上更新**（而不是等第二天早上），给你的定时任务加一个 GitHub 触发器：让你的 Claude（Claude Code）为你的晨报任务创建一个 **GitHub push 触发器**，指向你的仓库。之后每次保存设置，Claude 会马上为改动过的专栏补写内容，几分钟后 App 里就能看到。

保存设置需要 Contents 为 **Read and write** 的令牌。

## 想把仓库设为私有？

仓库里有你的主题设置和每天的简报。不想公开的话：

1. 仓库 ▸ **Settings** ▸ 最下面 **Danger Zone** ▸ **Change visibility** ▸ **Change to private**。
2. 生成一个只读令牌：打开 <https://github.com/settings/personal-access-tokens/new>
   - **Repository access** 选 **Only select repositories**，勾上**你自己的**晨报仓库（不是模板 `morning-brief`，名字很像，别选错）；
   - **Permissions** ▸ **Repositories** 标签 ▸ **Add permissions** ▸ 勾 **Contents**：只同步选 **Read-only**；还想在 App 里改设置、一键更新任务文件，选 **Read and write**；
   - **Expiration** 请选下拉里的固定选项，例如 **90 days**。不要选 Custom：自定义日期有时没被表单接收，点 Generate token 会毫无反应，页面也不提示。然后 **Generate token**，复制令牌（只显示一次）。
3. 晨报 ▸ 设置 ▸ 同步 ▸ **私有仓库访问**，粘贴令牌，点保存。令牌只存在这台 Mac 的钥匙串里。

云端定时任务不受影响（它通过 Claude GitHub App 访问仓库）。令牌过期后 App 会提示 401，重新生成一个即可。需要 App 1.3 或更新版本。

## 每日新知与 Takeaway

晨报顶部「今日速览」下面有一栏「💡 每日新知与 Takeaway」：每天 2–3 个从当天新闻里能学到的概念或事实（简短解释、举例、来源），加上 2–4 条值得记住的 takeaway。不想要就在 `profile.json` 的 `sections` 里写 `"learning": false`。晨报里的蓝色 ^^术语^^ 都会有解释弹窗（云端任务必须为每个新术语写词条）。

## 可信度提醒

App 会给每个来源和新闻链接加一个可信度标签（可信度高 / 较高 / 需谨慎核实 / 未经核实），依据是发布方网站和来源类型（官方、法院、学术、主流媒体、观点、社交媒体……）。点标签可以看原因和需要核实的地方。这只是自动提示，不代表文章内容已被核实。

## 已经建好仓库的老用户：怎么升级

1. App 里点「晨报 ▸ Check for Updates… 检查更新」，安装最新版。
2. 在 App 里点 **设置 ▸ 同步 ▸ 云端任务文件 ▸「从模板更新」**，App 会把这里最新的 `TASK.md` 和检查脚本复制到你的仓库（需要 Contents 为 **Read and write** 的令牌，见下方「访问令牌」）。没有读写令牌的话，也可以手动复制：打开这里的文件 ▸ 复制全部内容 ▸ 在你的仓库里编辑同名文件 ▸ 粘贴 ▸ Commit。
3. 想要多个专栏，就按上面「多个专栏」改你的 `profile.json`。
4. **改成多个专栏后，处理旧的专栏文件。** 旧版本生成的 `research/focus-日期.json` 没写属于哪个专栏，App 会先把它们放在第一个专栏，并在 设置 ▸ 主题 里显示 ⚠︎。要归到正确的专栏：在这些文件最外层加一行 `"focus": "专栏id",`（例如 `"focus": "software",`），或者把文件改名为 `focus-专栏id-日期.json`。改完运行一次 `python3 tools/build_index.py`（或者让 Claude 帮你改，它会顺便重建索引）。

## 常见问题

- **今天没有晨报**：打开 claude.ai/code/routines 看那次运行。常见原因：Claude 额度用完、Network access 不是 Full、`profile.json` 格式错误。
- **App 里看不到新栏目**：设置 ▸ Topic 主题 里看「当前」是否显示 ☁︎ profile.json；格式错误会显示 ⚠︎。
- **想改主题**：直接改仓库里的 `profile.json`，第二天的晨报就按新设定写，App 半小时内跟着变。
