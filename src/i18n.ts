import type { NewsEvent, ThemeId } from './domain';

export type Locale = 'zh-CN' | 'en';
export const LOCALE_STORAGE_KEY = 'atlas-locale';

const zh = {
  meta: {
    title: '环讯 Atlas · 世界正在发生',
  },
  locale: {
    switchLabel: '切换界面语言为英文',
    switchText: 'EN',
  },
  brand: {
    primary: '环讯',
    secondary: 'ATLAS',
    homeLabel: '环讯 Atlas，返回全球概览',
    homeTip: '返回全球概览并重置视图',
  },
  chrome: {
    boardNav: '观察板',
    boards: {
      all: '全视板',
      finance: '金融板',
      tech: '科技板',
    },
    boardTips: {
      all: '切换到全视板',
      finance: '切换到金融板',
      tech: '切换到科技板',
    },
    snapshotBadge: '离线资讯',
    addSource: '接入信源',
    addSourceTip: '接入 RSS、GeoRSS、JSON Feed、GeoJSON 或导入 OPML',
    search: '搜索资讯',
    searchTip: '在当前本地快照中搜索',
    sources: '信源与数据说明',
    help: '操作说明',
    edition: '全球观察',
    view: {
      globe: '01 / 地理视角',
      themes: '02 / 主题空间',
    },
    mapLabel: '地图中的资讯地点',
    heroAria: '当前观察范围',
    hero: {
      all: {
        eyebrow: '从一个地点，看见世界的变化',
        lines: ['世界，', '正在发生'],
        tail: '。',
        body: ['不止于远方。', '让每一条变化，都有来源可循。'],
      },
      finance: {
        eyebrow: '跟随政策与经济的脉络',
        lines: ['变化，', '自有脉络'],
        tail: '。',
        body: ['政策与市场从不孤立。', '沿着信源，看清每一次变化。'],
      },
      tech: {
        eyebrow: '发现思想与技术的新坐标',
        lines: ['下一步，', '从此开始'],
        tail: '。',
        body: ['新的想法需要坐标。', '跟随证据，而不是猜测。'],
      },
    },
    clues: '条线索',
    places: '个地点关联',
  },
  sourceScope: {
    title: '信源筛选',
    all: '全部信源',
    aria: '信源筛选',
    selected: (count: number) => `已选 ${count} 个信源`,
    expandTip: '展开信源列表',
    collapseTip: '收起信源列表',
    reset: '重置',
    resetTip: '重置信源筛选为全部信源',
    resetAria: '重置信源筛选为全部信源',
    allTip: '显示全部信源，不清除其他筛选',
    allAria: (count: number) => `全部信源，共 ${count} 条线索`,
    optionsAria: '选择信源',
    sourceTip: (label: string, active: boolean) => active ? `取消信源筛选：${label}` : `只看信源：${label}`,
    sourceAria: (label: string, count: number) => `信源筛选：${label}，${count} 条线索`,
  },
  regionAnchor: {
    trigger: '锚定区域',
    triggerAria: '锚定区域，打开区域目录',
    triggerTip: '选择一个区域，在球面上高亮其真实边界',
    currentAria: (name: string) => `更换锚定区域，当前：${name}`,
    currentTip: (name: string) => `更换锚定区域（当前：${name}）`,
    title: '选择锚定区域',
    searchAria: '搜索国家或地区',
    searchPlaceholder: '搜索中文、英文、ISO 代码或别称',
    listAria: '区域目录',
    clear: '清除锚定',
    clearAria: '清除区域锚定',
    clearTip: '移除国家边界高亮，不改变资讯筛选',
    note: (count: number) => `共 ${count} 个区域可选。锚定只改变地图视野；点击「查看线索」才筛选资讯。`,
    empty: '没有匹配的区域。',
    emptyHint: '可尝试中文名、英文名、ISO 代码或常用别称。',
  },
  regionBrowse: {
    view: (name: string) => `查看${name}线索`,
    exitNamed: (name: string) => `退出区域筛选：${name}`,
    exit: '退出区域筛选',
    title: (name: string) => `${name}线索`,
    back: '返回该区域全部线索',
    events: '事件发生地',
    associations: '机构／主体关联',
    empty: (name: string) => `当前筛选下无${name}线索`,
    emptyHint: '仅列出有地点证据且落在地图边界内的记录。退出区域筛选可回到原资讯范围。',
  },
  rail: {
    aria: '资讯线索',
    eyebrow: '现场快讯',
    worldTitle: '世界的此刻',
    techTitle: '科技动态',
    regionTitle: '这个地点的线索',
    expand: '展开资讯列表',
    collapse: '收起资讯列表',
    expandTip: '展开资讯列表以便阅读',
    collapseTip: '收起资讯列表，留出地图空间',
    rangeAria: '时间范围',
    rangeTip: '按资讯发布时间筛选',
    rangeNote: '以本版整理时间为基准',
    ranges: {
      day: '最近 24 小时',
      week: '最近 7 天',
      all: '快照全部',
    },
    techTracksAria: '科技资讯分类',
    techTracks: { releases: '官方发布', research: '研究预印本', other: '其他科技' },
    releaseHistory: '全部发布记录',
    releaseHistoryAction: '查看历史发布',
    releaseEmptyPeriod: '这段时间未收录官方模型发布',
    releaseEmptyEdition: '本版未收录官方模型发布',
    releaseEmptyHint: '这里只展示官方发布；研究预印本另列。',
    sourceEmptyPeriod: '所选信源在当前时间范围内没有线索',
    sourceHistoryHint: '快照收录了更早的线索，可扩大时间范围查看。',
    sourceHistoryAction: '查看所选信源的历史记录',
    back: '返回全部线索',
    backTip: '返回全部线索并重置视图',
    emptyTitle: '这个范围暂无线索',
    emptyBody: ['尝试调整时间、观察板或搜索。', '没有收录，不代表没有发生。'],
    emptyAction: '查看当前板块全部记录',
    emptyTrackAction: '查看此分类全部记录',
    emptyTip: '清除筛选并查看全部快照记录',
    foot: (ok: number, total: number) => `${ok} / ${total} 信源最近采集成功`,
    footTip: '查看信源与数据说明',
  },
  event: {
    retained: '保留旧数据',
    readTip: (title: string) => `阅读：${title}`,
  },
  reader: {
    locked: '阅读已锁定',
    close: '关闭资讯详情',
    closeTip: '关闭资讯详情',
    publishedDay: '发布日',
    timeMissing: '时刻／时区未提供',
    published: '发布',
    occurred: '发生',
    lockedNotice: '新快照已载入，仍保留你正在阅读的版本。重新选择事件可查看新版本。',
    filteredNotice: '此事件不在当前筛选内，阅读仍为你保留。',
    retainedNotice: (stamp: string) => `此信源最近一次采集失败；当前记录保留自 ${stamp} UTC 的采集。`,
    summaryKicker: '事件简述',
    summaryFallback: '来源未提供摘要。请从下方链接阅读原始材料。',
    summaryLabels: {
      editorial: '中文编辑摘要 · 依据原始材料整理',
      source: '来源描述 · 保留原文，不冒充机器翻译',
      metadata: '结构化事实 · 不包含未经验证的解读',
    },
    originalTitleLabel: '原文标题',
    editorialTitleLabel: '保留的中文编辑标题',
    facts: '已知信息',
    relationHeading: '这条资讯与地点的关系',
    relations: {
      event: '事件地点',
      publisher: '发布主体所在地',
      subject: '关联主体所在地',
    },
    precisions: {
      point: '来源提供坐标',
      city: '城市级关联，非精确发生点',
      country: '国家级关联',
    },
    noLocationTitle: '全球性 / 地点未确认',
    noLocationBody: '来源没有给出可核实的事件坐标。它仍可在主题空间中发现，不会被随意钉到某座城市。',
    sources: '回到原始来源',
    footnote: '本地资讯快照，不代表完整报道覆盖。机构所在地不等于事件发生地；研究或发布方的主张不等于独立验证。',
  },
  modal: {
    eyebrow: 'ATLAS / 现场笔记',
    close: '关闭弹窗',
  },
  search: {
    aria: '搜索资讯',
    inputAria: '搜索标题、地点或来源',
    placeholder: '搜索标题、地点、来源…',
    close: '关闭搜索',
    closeTip: '关闭搜索并清除关键词',
    clear: '清除搜索',
    clearTip: '清除关键词并返回当前筛选结果',
  },
  sources: {
    title: '每条线索，都有来处。',
    lede: '这里展示的是离线资讯，不是实时新闻服务。各信源的采集时间可能不同，打开页面不会联网采集。',
    generated: '本版资讯整理时间',
    recordSummary: (events: number, sources: number) => `${events} 条记录 · ${sources} 个信源最近采集成功`,
    count: (count: number) => `${count} 条`,
    retained: (count: number) => `保留 ${count} 条旧记录`,
    failed: '采集失败',
    errorSuffix: '不伪装为已更新。',
    lastFetch: (stamp: string) => `最近成功采集 ${stamp} UTC`,
    noFetch: '尚无成功采集记录',
    attempted: (stamp: string) => `最近尝试 ${stamp} UTC`,
    noAttempt: '旧版快照未单列尝试时间',
    sourceLink: '来源入口 ↗',
    policyLink: '使用条件 ↗',
    gemmaSummary: 'Google Gemma 文档来源与完整许可证（Apache-2.0）',
    gemmaSource: '官方文档源码 ↗',
    legal: '地表数据：Natural Earth（公有领域）。本产品不隶属任何信源机构，也不代表其背书。公开发布、商业使用及新增信源须再次核实权限。',
  },
  snapshotDebug: {
    title: '开发调试',
    description: '载入采集器生成的 JSON，仅替换当前页面的数据，保留已打开的正文。重新加载页面可恢复内置数据。',
    action: '导入快照 JSON',
    fileInput: '载入资讯快照文件',
  },
  help: {
    title: '换一个角度，理解世界。',
    items: [
      {
        index: '01',
        title: '先看分布',
        body: '拖动地球，滚轮或双指缩放。光点对应真实记录；同一地点的多条资讯会聚合显示。',
      },
      {
        index: '02',
        title: '再看关系',
        body: '切到主题空间，按经济、人工智能、地球动态与太空科学重新理解同一批线索。',
      },
      {
        index: '03',
        title: '让阅读停下来',
        body: '点击事件后内容锁定。切观察板、切布局或导入快照，都不会突然换掉你正在阅读的资讯。',
      },
      {
        index: '04',
        title: '不知道，就不猜',
        body: '没有可靠坐标的内容保留在全球／未定位入口。机构所在地、事件地点与影响范围不是一回事。',
      },
    ],
    keyboard: {
      search: '搜索',
      escape: '逐层关闭阅读或筛选',
      tab: '键盘选择光点与资讯',
    },
    legal: '减少动态效果可关闭自动运动；轻量画质降低绘制成本。未声称在所有设备达到同一帧率。',
  },
  footer: {
    eventPlace: '事件地点',
    subjectLink: '主体关联',
    global: '全球 / 未定位',
    unlocatedTip: '查看没有可靠地点坐标的资讯',
    texture: '环境微粒不代表资讯数量',
    snapshot: '资讯整理于',
    sourcesTip: '查看各信源的采集时间与使用条件',
  },
  layout: {
    aria: '空间布局',
    globe: '地理',
    themes: '主题',
    globeTip: '切换到地理视角',
    themesTip: '切换到主题空间',
  },
  scene: {
    qualityFull: '精细画质',
    qualityLight: '轻量画质',
    qualityTipFull: '切换到轻量画质以降低绘制成本',
    qualityTipLight: '切换到精细画质以提升细节',
    reduceMotion: '减少动态效果',
    enableMotion: '开启动态效果',
    reduceMotionTip: '减少自动运动与动态过渡',
    enableMotionTip: '重新开启动态过渡与自动运动',
    reset: '返回全球概览',
    resetTip: '返回全球概览并重置视图',
    loading: '正在展开世界',
    initError: '无法初始化三维场景。',
    errorTitle: '三维场景暂不可用',
    errorSuffix: '资讯仍可从列表阅读。',
    unlocatedOnly: (count: number) => `当前 ${count} 条线索均无地点坐标，留在「全球 / 未定位」`,
    unlocatedSwitchThemes: '切换到主题视图',
  },
  gesture: {
    drag: '拖动探索',
    zoom: '滚轮缩放',
    click: '点击光点阅读',
  },
  notice: {
    imported: (count: number) => `已载入 ${count} 条真实记录；正在阅读的内容保持不变。`,
    tooLarge: '快照文件不能超过 8 MB。',
    importFailed: '快照读取失败，原有内容保持不变。',
    close: '关闭提示',
  },
  fatal: {
    eyebrow: 'ATLAS / 数据错误',
    title: '这份快照未能载入。',
    fallback: '数据格式不正确。',
    instructions: '请重新获取 Atlas 页面或联系维护者。',
  },
  dates: {
    unknown: '时间未确认',
  },
  tagFilter: {
    aria: '自定义板块标签筛选',
    all: '全部标签',
    prefix: '#',
  },
  studio: {
    title: '接入你的信源，组装私人环讯。',
    lede: '支持标准开放订阅格式；有坐标的源自动落点，无坐标的源也可手动标注发布机构位置或留在「全球／未定位」。',
    companionOn: '已连接本地伴侣服务：可直接嗅探网页 Feed 并绕过跨域限制',
    companionOff: '纯前端模式：支持直连开放 CORS 的源；遇跨域拦截可导出配置或运行本地伴侣',
    tabs: {
      add: '接入单个信源',
      opml: '导入 OPML',
      export: '导出与自部署',
    },
    standardsTitle: '支持的开放格式规范',
    standards: [
      'RSS 2.0 / Atom 1.0 / RDF',
      'GeoRSS (point)',
      'JSON Feed 1.1',
      'GeoJSON (Point)',
      'OPML 2.0',
    ],
    presetsTitle: '一键试接示例',
    urlLabel: '信源或网站 URL（HTTPS）',
    urlPlaceholder: 'https://example.com/feed.xml 或 GeoJSON / JSON Feed 地址',
    formatLabel: '解析格式',
    formats: {
      auto: '自动识别',
      feed: 'RSS / Atom / GeoRSS',
      'json-feed': 'JSON Feed 1.1',
      geojson: 'GeoJSON (Point)',
      eonet: 'NASA EONET v3',
    },
    nameLabel: '显示名称（可选）',
    namePlaceholder: '留空则自动读取 Feed 标题',
    themeLabel: '空间星团归属',
    tagLabel: '自定义板块 Tag（可选）',
    tagPlaceholder: '例如：ai-agents、climate、macro',
    geoToggle: '为此机构源指定发布所在地（可选，不冒充事件地）',
    placeLabel: '机构地点名称',
    placePlaceholder: '例如：新加坡（新加坡金管局）',
    latLabel: '纬度',
    lonLabel: '经度',
    connect: '立即接入并预览',
    connecting: '正在读取并校验…',
    corsTitle: '浏览器跨域拦截了直连请求',
    corsBody: '这是目标站点未开放浏览器 CORS 导致的正常安全限制，不代表源不可用。你可以：',
    corsHint1: '1. 在项目目录运行 npm run companion，再打开本地地址即可由本机代抓并自动嗅探页面 RSS。',
    corsHint2: '2. 或点击下方按钮直接导出为标准 sources.json，用于 npm run refresh 或你的 GitHub Pages 定时更新。',
    saveConfigOnly: '仍保存为配置（待导出或本地采集）',
    copySnippet: '复制 sources.json 条目',
    copied: '已复制',
    customListTitle: (count: number) => `已添加的自定义信源 (${count})`,
    customEmpty: '暂未在浏览器中添加自定义信源。可从上方试接示例或填入任意开放 Feed 地址。',
    refreshOne: '刷新',
    removeOne: '移除',
    configOnlyBadge: '仅配置',
    opmlHelp: '导入 RSS 阅读器导出的 OPML 文件或粘贴 XML，自动把文件夹名转为板块 Tag。',
    opmlFile: '选择 OPML / XML 文件',
    opmlPlaceholder: '粘贴 <opml>...</opml> 内容…',
    opmlParse: '解析 OPML',
    opmlSummary: (count: number) => `识别到 ${count} 个 HTTPS 订阅源`,
    opmlApply: '保存选中信源到配置',
    opmlConnectAll: '保存并尝试直连',
    exportTitle: '带走你的私人配置，5 分钟部署上线',
    exportBody: '所有自定义信源都可导出为标准文件，随时迁移到本地离线构建或 Fork 后的 GitHub Pages 自动更新仓库。',
    downloadSources: '下载 sources.json',
    downloadOpml: '导出 atlas-feeds.opml',
    selfHostSteps: [
      '1. 使用公开仓库模板创建你的仓库（或本地运行 npm run oss:export）。',
      '2. 用导出的文件替换 scripts/sources.json，推送即可触发 GitHub Actions 每 6 小时自动采集与发布。',
      '3. 本地离线使用可直接运行 npm run companion 或 npm run update && npm run build。',
    ],
    invalidUrl: '请输入有效的 HTTPS 地址。',
    invalidCoords: '请填写合法的经纬度（纬度 -90~90，经度 -180~180）和地点名称。',
    addedOk: (name: string, count: number) => `已接入「${name}」（${count} 条线索）`,
    savedConfigOk: (name: string) => `已将「${name}」保存为配置，可导出至 sources.json。`,
    opmlEmpty: '未在 OPML 中找到有效的 HTTPS 订阅地址。',
    opmlSaved: (count: number) => `已导入 ${count} 个订阅配置。`,
  },
};

export type Messages = typeof zh;

const en: Messages = {
  meta: {
    title: 'Atlas Dispatch · The world in motion',
  },
  locale: {
    switchLabel: 'Switch interface language to Chinese',
    switchText: '中文',
  },
  brand: {
    primary: 'ATLAS',
    secondary: 'DISPATCH',
    homeLabel: 'Atlas Dispatch, return to global overview',
    homeTip: 'Return to the global overview and reset the view',
  },
  chrome: {
    boardNav: 'Observation boards',
    boards: {
      all: 'All stories',
      finance: 'Finance',
      tech: 'Technology',
    },
    boardTips: {
      all: 'Switch to all stories',
      finance: 'Switch to the finance board',
      tech: 'Switch to the technology board',
    },
    snapshotBadge: 'Offline edition',
    addSource: 'Add source',
    addSourceTip: 'Connect RSS, GeoRSS, JSON Feed, GeoJSON, or import OPML',
    search: 'Search dispatches',
    searchTip: 'Search within the current snapshot',
    sources: 'Sources and data notes',
    help: 'How to use Atlas',
    edition: 'THE WORLD, IN PERSPECTIVE',
    view: {
      globe: '01 / GEOGRAPHIC VIEW',
      themes: '02 / THEMATIC SPACE',
    },
    mapLabel: 'News locations on the map',
    heroAria: 'Current scope',
    hero: {
      all: {
        eyebrow: 'See a changing world from a single place',
        lines: ['The world,', 'in motion'],
        tail: '.',
        body: ['Not only far away.', 'Every shift should lead back to a source.'],
      },
      finance: {
        eyebrow: 'Follow the lines of policy and economy',
        lines: ['Change has', 'its own logic'],
        tail: '.',
        body: ['Policy and markets never move alone.', 'Follow each shift back to its source.'],
      },
      tech: {
        eyebrow: 'Find new coordinates for ideas and technology',
        lines: ['The next step', 'starts here'],
        tail: '.',
        body: ['New ideas need coordinates.', 'Follow the evidence, not the guesswork.'],
      },
    },
    clues: 'dispatches',
    places: 'place links',
  },
  sourceScope: {
    title: 'BY SOURCE',
    all: 'All sources',
    aria: 'Source filter',
    selected: (count: number) => `${count} ${count === 1 ? 'source' : 'sources'} selected`,
    expandTip: 'Expand the source list',
    collapseTip: 'Collapse the source list',
    reset: 'Reset',
    resetTip: 'Reset the source filter to all sources',
    resetAria: 'Reset the source filter to all sources',
    allTip: 'Show all sources without changing other filters',
    allAria: (count: number) => `All sources, ${count} ${count === 1 ? 'dispatch' : 'dispatches'}`,
    optionsAria: 'Choose sources',
    sourceTip: (label: string, active: boolean) => active ? `Remove source filter: ${label}` : `View only this source: ${label}`,
    sourceAria: (label: string, count: number) => `Filter by source: ${label}, ${count} ${count === 1 ? 'dispatch' : 'dispatches'}`,
  },
  regionAnchor: {
    trigger: 'Anchor region',
    triggerAria: 'Anchor region, open the region directory',
    triggerTip: 'Choose a region and highlight its real boundary on the globe',
    currentAria: (name: string) => `Change anchored region (current: ${name})`,
    currentTip: (name: string) => `Change anchored region (current: ${name})`,
    title: 'Anchor a region',
    searchAria: 'Search countries and regions',
    searchPlaceholder: 'Search Chinese, English, ISO codes, or aliases',
    listAria: 'Region directory',
    clear: 'Clear anchor',
    clearAria: 'Clear the anchored region',
    clearTip: 'Remove the boundary highlight without changing dispatch filters',
    note: (count: number) => `${count} regions available. Anchoring changes the map view only; choose “View dispatches” to filter stories.`,
    empty: 'No matching regions.',
    emptyHint: 'Try a Chinese name, English name, ISO code, or common alias.',
  },
  regionBrowse: {
    view: (name: string) => `View dispatches: ${name}`,
    exitNamed: (name: string) => `Clear region filter: ${name}`,
    exit: 'Clear region filter',
    title: (name: string) => `Dispatches: ${name}`,
    back: 'Back to region dispatches',
    events: 'Event locations',
    associations: 'Publisher or subject associations',
    empty: (name: string) => `No dispatches for ${name} under the current filters`,
    emptyHint: 'Only records with a documented location inside the mapped boundary are included. Clear the region filter to return to your previous scope.',
  },
  rail: {
    aria: 'News dispatches',
    eyebrow: 'FIELD DISPATCHES',
    worldTitle: 'The world right now',
    techTitle: 'Technology dispatches',
    regionTitle: 'Dispatches from this place',
    expand: 'Expand news list',
    collapse: 'Collapse news list',
    expandTip: 'Expand the news list for reading',
    collapseTip: 'Collapse the news list and leave more room for the map',
    rangeAria: 'Time range',
    rangeTip: 'Filter by publication date',
    rangeNote: 'Relative to this edition',
    ranges: {
      day: 'Last 24 hours',
      week: 'Last 7 days',
      all: 'Full snapshot',
    },
    techTracksAria: 'Technology news categories',
    techTracks: { releases: 'Official releases', research: 'Research preprints', other: 'Other tech' },
    releaseHistory: 'All release records',
    releaseHistoryAction: 'View release history',
    releaseEmptyPeriod: 'No official model releases recorded in this period',
    releaseEmptyEdition: 'No official model releases in this edition',
    releaseEmptyHint: 'This section is for official releases. Research preprints are listed separately.',
    sourceEmptyPeriod: 'No dispatches from the selected sources in this period',
    sourceHistoryHint: 'This snapshot contains earlier matches. Expand the time range to see them.',
    sourceHistoryAction: 'View history for selected sources',
    back: 'Back to all dispatches',
    backTip: 'Return to all dispatches and reset the view',
    emptyTitle: 'No dispatches in this range',
    emptyBody: ['Try adjusting the time, board, or search.', 'Not being listed does not mean it did not happen.'],
    emptyAction: 'View all records in this board',
    emptyTrackAction: 'View all records in this category',
    emptyTip: 'Clear filters and view every record in the snapshot',
    foot: (ok: number, total: number) => `${ok} / ${total} sources last fetched successfully`,
    footTip: 'View sources and data notes',
  },
  event: {
    retained: 'Retained older record',
    readTip: (title: string) => `Read: ${title}`,
  },
  reader: {
    locked: 'READING LOCKED',
    close: 'Close event details',
    closeTip: 'Close event details',
    publishedDay: 'Published',
    timeMissing: 'time/timezone not provided',
    published: 'Published',
    occurred: 'Occurred',
    lockedNotice: 'A new snapshot has loaded, but the version you are reading is retained. Select the event again to view the new version.',
    filteredNotice: 'This event is outside the current filter. Your reading copy is still retained.',
    retainedNotice: (stamp: string) => `This source failed to update; the current record is retained from the collection at ${stamp} UTC.`,
    summaryKicker: 'EVENT SUMMARY',
    summaryFallback: 'The source provided no summary. Read the original material through the links below.',
    summaryLabels: {
      editorial: 'Chinese editorial summary · based on original source material',
      source: 'Source description · original text retained, not presented as machine translation',
      metadata: 'Structured facts · no unverified interpretation',
    },
    originalTitleLabel: 'Original title',
    editorialTitleLabel: 'Retained Chinese editorial title',
    facts: 'Known information',
    relationHeading: 'How this event relates to places',
    relations: {
      event: 'Event location',
      publisher: 'Publisher location',
      subject: 'Subject location',
    },
    precisions: {
      point: 'Coordinates supplied by the source',
      city: 'City-level association, not an exact event point',
      country: 'Country-level association',
    },
    noLocationTitle: 'Global / location unconfirmed',
    noLocationBody: 'The source provides no verifiable event coordinates. The event can still be found in thematic space and will not be pinned to an arbitrary city.',
    sources: 'Original sources',
    footnote: 'This is a local news snapshot, not complete coverage. An institution’s location is not the event location; a claim by a researcher or publisher is not independent verification.',
  },
  modal: {
    eyebrow: 'ATLAS / FIELD NOTES',
    close: 'Close dialog',
  },
  search: {
    aria: 'Search dispatches',
    inputAria: 'Search titles, places, or sources',
    placeholder: 'Search titles, places, sources…',
    close: 'Close search',
    closeTip: 'Close search and clear the keyword',
    clear: 'Clear search',
    clearTip: 'Clear the keyword and return to the current filter results',
  },
  sources: {
    title: 'Every dispatch has a provenance.',
    lede: 'This offline edition is not a live news service. Collection times vary by source. Opening the page does not fetch news.',
    generated: 'Edition compiled',
    recordSummary: (events: number, sources: number) => `${events} ${events === 1 ? 'record' : 'records'} · ${sources} ${sources === 1 ? 'source' : 'sources'} last fetched successfully`,
    count: (count: number) => `${count} ${count === 1 ? 'record' : 'records'}`,
    retained: (count: number) => `Retained ${count} older ${count === 1 ? 'record' : 'records'}`,
    failed: 'Collection failed',
    errorSuffix: 'not presented as an update.',
    lastFetch: (stamp: string) => `Last successful collection ${stamp} UTC`,
    noFetch: 'No successful collection yet',
    attempted: (stamp: string) => `Last attempt ${stamp} UTC`,
    noAttempt: 'Older snapshots did not record the attempt time',
    sourceLink: 'Source entry ↗',
    policyLink: 'Usage terms ↗',
    gemmaSummary: 'Google Gemma documentation source and full license (Apache-2.0)',
    gemmaSource: 'Official documentation source ↗',
    legal: 'Surface data: Natural Earth (public domain). This product is not affiliated with, or endorsed by, any source institution. Public release, commercial use, and new sources require renewed permission checks.',
  },
  snapshotDebug: {
    title: 'Developer tools',
    description: 'Load collector-generated JSON for this page only. The open article stays unchanged. Reload to restore the built-in data.',
    action: 'Import snapshot JSON',
    fileInput: 'Load a news snapshot file',
  },
  help: {
    title: 'Change the angle. Read the world.',
    items: [
      {
        index: '01',
        title: 'Start with the distribution',
        body: 'Drag the globe, then use the wheel or a pinch to zoom. Each point is a real record; multiple stories from one place are grouped.',
      },
      {
        index: '02',
        title: 'Then read the relationships',
        body: 'Switch to thematic space to reconsider the same dispatches through the economy, artificial intelligence, Earth systems, and space science.',
      },
      {
        index: '03',
        title: 'Let reading pause',
        body: 'Selecting an event locks the reading copy. Changing the board, layout, or snapshot never swaps out what you are reading.',
      },
      {
        index: '04',
        title: 'When uncertain, do not guess',
        body: 'Content without reliable coordinates stays at the global / unlocated entry. An institution’s location, the event location, and the area of impact are not the same thing.',
      },
    ],
    keyboard: {
      search: 'Search',
      escape: 'Close reading or filters step by step',
      tab: 'Select points and dispatches by keyboard',
    },
    legal: 'Reduced motion disables automatic movement; light quality lowers rendering cost. No claim is made that every device reaches the same frame rate.',
  },
  footer: {
    eventPlace: 'Event location',
    subjectLink: 'Subject association',
    global: 'Global / unlocated',
    unlocatedTip: 'View dispatches without reliable location coordinates',
    texture: 'Ambient particles do not represent story volume',
    snapshot: 'Edition compiled',
    sourcesTip: 'View collection times and usage terms by source',
  },
  layout: {
    aria: 'Spatial layout',
    globe: 'Globe',
    themes: 'Themes',
    globeTip: 'Switch to the geographic view',
    themesTip: 'Switch to thematic space',
  },
  scene: {
    qualityFull: 'Full quality',
    qualityLight: 'Light quality',
    qualityTipFull: 'Switch to light quality to lower rendering cost',
    qualityTipLight: 'Switch to full quality for more detail',
    reduceMotion: 'Reduce motion',
    enableMotion: 'Enable motion',
    reduceMotionTip: 'Reduce automatic movement and animated transitions',
    enableMotionTip: 'Restore animated transitions and automatic movement',
    reset: 'Return to global overview',
    resetTip: 'Return to the global overview and reset the view',
    loading: 'Unfolding the world',
    initError: 'The 3D scene could not be initialized.',
    errorTitle: '3D scene unavailable',
    errorSuffix: 'Dispatches are still available in the list.',
    unlocatedOnly: (count: number) => `All ${count} matching ${count === 1 ? 'dispatch has' : 'dispatches have'} no geographic coordinates`,
    unlocatedSwitchThemes: 'View in Themes',
  },
  gesture: {
    drag: 'Drag to explore',
    zoom: 'Wheel to zoom',
    click: 'Select a point to read',
  },
  notice: {
    imported: (count: number) => `Loaded ${count} real ${count === 1 ? 'record' : 'records'}; the event you are reading stays unchanged.`,
    tooLarge: 'The snapshot file cannot exceed 8 MB.',
    importFailed: 'The snapshot could not be read; existing content is unchanged.',
    close: 'Close notification',
  },
  fatal: {
    eyebrow: 'ATLAS / DATA ERROR',
    title: 'This snapshot could not be loaded.',
    fallback: 'The data format is invalid.',
    instructions: 'Get a fresh copy of Atlas or contact the maintainer.',
  },
  dates: {
    unknown: 'Time unconfirmed',
  },
  tagFilter: {
    aria: 'Custom board tags',
    all: 'All tags',
    prefix: '#',
  },
  studio: {
    title: 'Bring your own feeds. Build a personal Atlas.',
    lede: 'Supports open syndication standards. Geo-tagged feeds pin automatically; non-geo feeds stay global unless you declare a publisher location.',
    companionOn: 'Local companion connected: auto-discovers site feeds without browser CORS limits',
    companionOff: 'Browser-only mode: connects CORS-enabled feeds live, or exports sources.json for local/Pages refresh',
    tabs: {
      add: 'Add Feed',
      opml: 'Import OPML',
      export: 'Export & Self-Host',
    },
    standardsTitle: 'Supported Open Standards',
    standards: [
      'RSS 2.0 / Atom 1.0 / RDF',
      'GeoRSS (point)',
      'JSON Feed 1.1',
      'GeoJSON (Point)',
      'OPML 2.0',
    ],
    presetsTitle: 'Try a live open feed',
    urlLabel: 'Feed or site URL (HTTPS)',
    urlPlaceholder: 'https://example.com/feed.xml or GeoJSON / JSON Feed URL',
    formatLabel: 'Format',
    formats: {
      auto: 'Auto-detect',
      feed: 'RSS / Atom / GeoRSS',
      'json-feed': 'JSON Feed 1.1',
      geojson: 'GeoJSON (Point)',
      eonet: 'NASA EONET v3',
    },
    nameLabel: 'Display name (optional)',
    namePlaceholder: 'Leave blank to use the feed title',
    themeLabel: 'Thematic cluster',
    tagLabel: 'Custom board tag (optional)',
    tagPlaceholder: 'e.g. ai-agents, climate, macro',
    geoToggle: 'Declare publisher location (optional; never presented as event site)',
    placeLabel: 'Publisher place label',
    placePlaceholder: 'e.g. Singapore (MAS)',
    latLabel: 'Latitude',
    lonLabel: 'Longitude',
    connect: 'Connect & preview',
    connecting: 'Fetching & validating…',
    corsTitle: 'Blocked by browser CORS policy',
    corsBody: 'This remote site does not send CORS headers for direct browser requests. You can still use it cleanly:',
    corsHint1: '1. Run npm run companion locally to auto-discover site feeds and fetch without CORS restrictions.',
    corsHint2: '2. Or save and export sources.json below for npm run refresh or your GitHub Pages workflow.',
    saveConfigOnly: 'Save config for export',
    copySnippet: 'Copy sources.json entry',
    copied: 'Copied',
    customListTitle: (count: number) => `Custom feeds (${count})`,
    customEmpty: 'No custom feeds added in this browser yet. Try a live preset above or paste any open feed URL.',
    refreshOne: 'Refresh',
    removeOne: 'Remove',
    configOnlyBadge: 'Config only',
    opmlHelp: 'Import an OPML file or paste XML from your RSS reader. Folder names become custom board tags.',
    opmlFile: 'Choose OPML / XML file',
    opmlPlaceholder: 'Paste <opml>...</opml> here…',
    opmlParse: 'Parse OPML',
    opmlSummary: (count: number) => `Found ${count} valid HTTPS feeds`,
    opmlApply: 'Save selected configs',
    opmlConnectAll: 'Save & try live fetch',
    exportTitle: 'Own your setup: export & deploy in 5 minutes',
    exportBody: 'Export your sources as standard files for offline builds or an automated GitHub Pages fork.',
    downloadSources: 'Download sources.json',
    downloadOpml: 'Export atlas-feeds.opml',
    selfHostSteps: [
      '1. Fork or use the open-source template repository (or run npm run oss:export locally).',
      '2. Replace scripts/sources.json with your exported file; GitHub Actions refreshes every 6 hours.',
      '3. For local offline reading, run npm run companion or npm run update && npm run build.',
    ],
    invalidUrl: 'Please enter a valid HTTPS URL.',
    invalidCoords: 'Please provide a place label and valid coordinates (lat -90..90, lon -180..180).',
    addedOk: (name: string, count: number) => `Connected “${name}” (${count} dispatches)`,
    savedConfigOk: (name: string) => `Saved “${name}” as config for export or companion refresh.`,
    opmlEmpty: 'No valid HTTPS feeds found in this OPML.',
    opmlSaved: (count: number) => `Imported ${count} feed configurations.`,
  },
};

export const messages: Record<Locale, Messages> = { 'zh-CN': zh, en };

const dateFormatters: Record<Locale, Intl.DateTimeFormat> = {
  'zh-CN': new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', month: '2-digit', day: '2-digit' }),
  en: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', day: '2-digit' }),
};
const dateTimeFormatters: Record<Locale, Intl.DateTimeFormat> = {
  'zh-CN': new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
  en: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
};
const editionFormatters: Record<Locale, Intl.DateTimeFormat> = {
  'zh-CN': new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }),
  en: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', year: 'numeric', month: 'short', day: '2-digit' }),
};
const stampFormatters: Record<Locale, Intl.DateTimeFormat> = {
  'zh-CN': new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
  en: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
};
const secondStampFormatters: Record<Locale, Intl.DateTimeFormat> = {
  'zh-CN': new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  en: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
};

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatLocaleDate(value: string, locale: Locale, withTime = false): string {
  const date = validDate(value);
  if (!date) return messages[locale].dates.unknown;
  return (withTime ? dateTimeFormatters : dateFormatters)[locale].format(date);
}

export function formatEditionDay(value: string, locale: Locale): string {
  const date = validDate(value);
  return date ? editionFormatters[locale].format(date) : messages[locale].dates.unknown;
}

export function formatUtcStamp(value: string, locale: Locale, withSeconds = false): string {
  const date = validDate(value);
  if (!date) return messages[locale].dates.unknown;
  return (withSeconds ? secondStampFormatters : stampFormatters)[locale].format(date);
}

const kindEntries = [
  { key: 'earthquake', zh: '地震', en: 'Earthquake' },
  { key: 'naturalEvent', zh: '自然事件', en: 'Natural event' },
  { key: 'disasterAlert', zh: '灾害警报', en: 'Disaster alert' },
  { key: 'nasaRelease', zh: 'NASA 发布', en: 'NASA release' },
  { key: 'esaRelease', zh: 'ESA 发布', en: 'ESA release' },
  { key: 'researchPreprint', zh: '研究预印本', en: 'Research preprint' },
  { key: 'institutionalRelease', zh: '机构发布', en: 'Institutional release' },
  { key: 'officialModelRelease', zh: '官方模型发布', en: 'Official model release' },
] as const;

type KnownKind = typeof kindEntries[number]['key'];

export function kindLabel(value: string, locale: Locale): string {
  const entry = kindEntries.find(item => item.zh === value || item.en === value);
  return entry ? entry[locale === 'zh-CN' ? 'zh' : 'en'] : value;
}

function isKind(value: string, key: KnownKind): boolean {
  return kindEntries.some(item => item.key === key && (item.zh === value || item.en === value));
}

export function isOfficialModelRelease(value: string): boolean {
  return isKind(value, 'officialModelRelease');
}

export function isResearchPreprint(value: string): boolean {
  return isKind(value, 'researchPreprint');
}

const themeNames: Record<ThemeId, Record<Locale, string>> = {
  earth: { 'zh-CN': '地球动态', en: 'Earth systems' },
  economy: { 'zh-CN': '经济与政策', en: 'Economy & policy' },
  ai: { 'zh-CN': '人工智能', en: 'Artificial intelligence' },
  space: { 'zh-CN': '太空与科学', en: 'Space & science' },
};

export function themeLabel(theme: ThemeId, locale: Locale): string {
  return themeNames[theme][locale];
}

const providerNames = [
  { zh: 'USGS 地震监测', en: 'USGS Earthquake Monitoring' },
  { zh: 'NASA EONET 自然事件', en: 'NASA EONET Natural Events' },
  { zh: 'GDACS 全球灾害警报', en: 'GDACS Global Disaster Alerts' },
  { zh: '美联储理事会', en: 'Federal Reserve Board' },
  { zh: '欧洲央行', en: 'European Central Bank' },
  { zh: '日本央行', en: 'Bank of Japan' },
  { zh: '英格兰银行', en: 'Bank of England' },
  { zh: '澳大利亚储备银行', en: 'Reserve Bank of Australia' },
  { zh: 'arXiv 研究元数据', en: 'arXiv Research Metadata' },
  { zh: 'NASA 官方内容', en: 'NASA Official Content' },
  { zh: '欧洲航天局', en: 'European Space Agency' },
  { zh: 'Google Gemma 官方发布记录', en: 'Google Gemma Official Release Records' },
  { zh: 'USGS', en: 'USGS' },
  { zh: 'NASA EONET', en: 'NASA EONET' },
  { zh: 'GDACS', en: 'GDACS' },
  { zh: 'NASA', en: 'NASA' },
  { zh: 'arXiv', en: 'arXiv' },
  { zh: '美联储', en: 'Federal Reserve' },
  { zh: 'Google Gemma · 发布记录', en: 'Google Gemma · release notes' },
  { zh: '官方文档源码 · Apache-2.0', en: 'Official documentation source · Apache-2.0' },
] as const;

export function providerLabel(value: string, locale: Locale): string {
  const entry = providerNames.find(item => item.zh === value || item.en === value);
  return entry ? entry[locale === 'zh-CN' ? 'zh' : 'en'] : value;
}

const placeLabels = [
  { zh: '华盛顿特区（美联储理事会）', en: 'Washington, D.C. (Federal Reserve Board)' },
  { zh: '法兰克福（欧洲央行）', en: 'Frankfurt (European Central Bank)' },
  { zh: '东京（日本央行）', en: 'Tokyo (Bank of Japan)' },
  { zh: '伦敦（英格兰银行）', en: 'London (Bank of England)' },
  { zh: '悉尼（澳大利亚储备银行）', en: 'Sydney (Reserve Bank of Australia)' },
  { zh: '巴黎（欧洲航天局总部）', en: 'Paris (ESA Headquarters)' },
  { zh: '库鲁航天发射场', en: 'Guiana Space Centre (Kourou)' },
  { zh: '欧洲空间操作中心（达姆施塔特）', en: 'ESOC (Darmstadt)' },
  { zh: '欧洲空间研究与技术中心（诺德韦克）', en: 'ESTEC (Noordwijk)' },
  { zh: '欧洲空间地球观测中心（弗拉斯卡蒂）', en: 'ESRIN (Frascati)' },
  { zh: '欧洲空间天文学中心（马德里）', en: 'ESAC (Madrid)' },
  { zh: '肯尼迪航天中心', en: 'Kennedy Space Center' },
  { zh: '约翰逊航天中心', en: 'Johnson Space Center' },
  { zh: '喷气推进实验室', en: 'Jet Propulsion Laboratory' },
  { zh: '戈达德航天中心', en: 'Goddard Space Flight Center' },
  { zh: '马歇尔航天中心', en: 'Marshall Space Flight Center' },
  { zh: '阿姆斯特朗飞行研究中心', en: 'Armstrong Flight Research Center' },
  { zh: '艾姆斯研究中心', en: 'Ames Research Center' },
  { zh: '兰利研究中心', en: 'Langley Research Center' },
  { zh: '斯坦尼斯航天中心', en: 'Stennis Space Center' },
  { zh: '沃洛普斯飞行设施', en: 'Wallops Flight Facility' },
  { zh: '梅溪站', en: 'Plum Brook Station' },
  { zh: '位置未标明', en: 'Location unspecified' },
  { zh: 'USGS 震中', en: 'USGS epicenter' },
] as const;

/**
 * Translates known built-in Chinese place/facility labels for the active locale.
 */
export function placeLabel(value: string, locale: Locale): string {
  const entry = placeLabels.find(item => item.zh === value || item.en === value);
  return entry ? entry[locale === 'zh-CN' ? 'zh' : 'en'] : value;
}

const exactPlaceEvidences: Record<string, string> = {
  '美联储理事会位于华盛顿特区；该坐标表示发布机构所在地，并非事件发生地，也不表示政策影响范围。':
    'The Federal Reserve Board is located in Washington, D.C.; these coordinates denote the publisher location, not the event site or policy impact area.',
  '美联储理事会位于华盛顿特区；该坐标只表示发布机构所在地，并非事件发生地，也不表示政策影响范围。':
    'The Federal Reserve Board is located in Washington, D.C.; these coordinates denote only the publisher location, not the event site or policy impact area.',
  '欧洲央行总部位于法兰克福；该坐标表示发布机构所在地，并非事件发生地，也不表示政策影响范围。':
    'The European Central Bank is headquartered in Frankfurt; these coordinates denote the publisher location, not the event site or policy impact area.',
  '欧洲央行总部位于德国法兰克福；该坐标表示发布机构所在地，并非事件发生地，也不表示政策影响范围。':
    'The European Central Bank is headquartered in Frankfurt, Germany; these coordinates denote the publisher location, not the event site or policy impact area.',
  '欧洲央行总部位于德国法兰克福；该坐标只表示发布机构所在地，并非事件发生地，也不表示政策影响范围。':
    'The European Central Bank is headquartered in Frankfurt, Germany; these coordinates denote only the publisher location, not the event site or policy impact area.',
  '日本央行总部位于日本东京；该坐标表示发布机构所在地，并非事件发生地，也不表示政策影响范围。':
    'The Bank of Japan is headquartered in Tokyo, Japan; these coordinates denote the publisher location, not the event site or policy impact area.',
  '英格兰银行总部位于英国伦敦；该坐标表示发布机构所在地，并非事件发生地，也不表示政策影响范围。':
    'The Bank of England is headquartered in London, United Kingdom; these coordinates denote the publisher location, not the event site or policy impact area.',
  '澳大利亚储备银行总部位于澳大利亚悉尼；该坐标表示发布机构所在地，并非事件发生地，也不表示政策影响范围。':
    'The Reserve Bank of Australia is headquartered in Sydney, Australia; these coordinates denote the publisher location, not the event site or policy impact area.',
  '欧洲航天局总部位于法国巴黎；该坐标表示发布机构所在地，并非事件发生地或任务地点。':
    'The European Space Agency is headquartered in Paris, France; these coordinates denote the publisher location, not the event or mission site.',
};

const facilityEvidencePattern = /^(NASA|ESA) 原文明确提及 (.+?)；坐标为其公开所在地，仅表示被提及的机构\/设施位置，不表示事件影响范围或发生地。$/;
const usgsLocalEvidencePattern = /^USGS 事件坐标（纬度 ([\d.-]+)，经度 ([\d.-]+)）；(深度未提供|震源深度 ([\d.-]+) km)。坐标表示震中位置，不用于判断灾害严重程度。$/;
const usgsPublicEvidencePattern = /^USGS 发布的结构化事件坐标（纬度 ([\d.-]+)，经度 ([\d.-]+)）；仅表示震中位置，不表示灾害严重程度或影响范围。$/;
const eonetEvidencePattern = /^NASA EONET 结构化事件坐标（纬度 ([\d.-]+)，经度 ([\d.-]+)）；类别：(.+?)。坐标表示最新观测点，不用于判断灾害严重程度。$/;
const gdacsEvidencePattern = /^GDACS 全球灾害警报坐标（纬度 ([\d.-]+)，经度 ([\d.-]+)）；事件类型：(.+?)，警报级别：(.+?)。警报由自动模型生成，仅供参考，不替代当地官方通知。$/;

const hazardTranslations: Record<string, string> = {
  野火: 'Wildfire',
  强风暴: 'Severe storm',
  火山: 'Volcano',
  洪涝: 'Flood',
  '海冰／湖冰': 'Sea/lake ice',
  干旱: 'Drought',
  '沙尘／霾': 'Dust & haze',
  滑坡: 'Landslide',
  暴雪: 'Snow',
  极端气温: 'Temperature extremes',
  自然事件: 'Natural event',
  热带气旋: 'Tropical cyclone',
  红色警报: 'Red alert',
  橙色警报: 'Orange alert',
  绿色提示: 'Green notice',
  常规提示: 'General notice',
};

/**
 * Translates known built-in geographic evidence statements into English when `locale === 'en'`.
 * Unknown or custom evidence strings pass through verbatim.
 */
export function placeEvidence(value: string, locale: Locale): string {
  if (locale === 'zh-CN') return value;
  const exact = exactPlaceEvidences[value];
  if (exact) return exact;
  const facility = facilityEvidencePattern.exec(value);
  if (facility) {
    return `The ${facility[1]} release explicitly mentions ${placeLabel(facility[2], 'en')}; the coordinates mark its published facility location, indicating only the referenced institution/facility rather than impact area or event site.`;
  }
  const usgsLocal = usgsLocalEvidencePattern.exec(value);
  if (usgsLocal) {
    const depth = usgsLocal[4] ? `focal depth ${usgsLocal[4]} km` : 'depth not provided';
    return `USGS event coordinates (lat ${usgsLocal[1]}, lon ${usgsLocal[2]}); ${depth}. Coordinates indicate the epicenter and do not imply hazard severity.`;
  }
  const usgsPublic = usgsPublicEvidencePattern.exec(value);
  if (usgsPublic) {
    return `Structured USGS event coordinates (lat ${usgsPublic[1]}, lon ${usgsPublic[2]}); indicates the epicenter only and does not imply hazard severity or impact area.`;
  }
  const eonet = eonetEvidencePattern.exec(value);
  if (eonet) {
    const category = hazardTranslations[eonet[3]] ?? eonet[3];
    return `Structured NASA EONET coordinates (lat ${eonet[1]}, lon ${eonet[2]}); category: ${category}. Coordinates indicate the latest observed point and do not imply hazard severity.`;
  }
  const gdacs = gdacsEvidencePattern.exec(value);
  if (gdacs) {
    const type = hazardTranslations[gdacs[3]] ?? gdacs[3];
    const alert = hazardTranslations[gdacs[4]] ?? gdacs[4];
    return `GDACS global alert coordinates (lat ${gdacs[1]}, lon ${gdacs[2]}); type: ${type}, level: ${alert}. Automated model alert for reference only; does not replace local official advisories.`;
  }
  return value;
}

const englishSourceRights: Record<string, string> = {
  'USGS 地震目录属美国政府公开数据，可复制与再分发；本产品只展示结构化事件元数据并署名 USGS，不据震级推断伤亡、破坏或灾害严重程度。第三方内容除外。':
    'USGS earthquake catalogs are U.S. government public data eligible for copying and redistribution; this product displays structured event metadata attributed to USGS and does not infer casualties, damage, or hazard severity from magnitude. Excludes third-party content.',
  'NASA EONET 地球观测自然事件元数据属美国政府公开数据（CC0）；本产品只展示官方结构化事件元数据并署名 NASA EONET，不据事件类型推断伤亡、损失或灾害严重程度。第三方链接与图像适用各自条款。':
    'NASA EONET natural event metadata is U.S. government public data (CC0); this product displays official structured event metadata attributed to NASA EONET without inferring casualties, loss, or hazard severity. Third-party links and imagery remain subject to their own terms.',
  'GDACS 由联合国与欧盟联合运营，允许在署名 Global Disaster Alert and Coordination System (GDACS) 前提下用于公益与信息展示；警报多由自动模型生成，仅供参考，不替代当地官方应急通知。':
    'GDACS is jointly operated by the UN and EU and permits public-interest display with attribution to Global Disaster Alert and Coordination System (GDACS); alerts are largely model-generated for reference only and do not substitute for official local warnings.',
  '美联储理事会网站内容除特别标注外属公有领域，可复制与分发；本产品只使用新闻稿标题、短描述与链接并注明来源，不改写为美联储立场。第三方材料与引用除外。':
    'Content on the Federal Reserve Board website is in the public domain unless otherwise noted and may be copied and distributed; this product uses only press release titles, short descriptions, and links with attribution, without reframing as Federal Reserve positions. Excludes third-party material and citations.',
  '欧洲央行允许在注明来源的前提下使用网站信息，修改须明确说明；本产品展示新闻稿标题、短描述与链接，中文编辑标题保留原文并标注编辑，不转载署名文章全文。统计与第三方材料适用各自政策。':
    'The European Central Bank permits reuse of website information with attribution and clear notice of modifications; this product displays press release titles, short descriptions, and links, retaining original titles on edited Chinese entries without republishing authored full texts. Statistics and third-party materials remain subject to their respective policies.',
  '日本央行网站与 RSS 内容受日本著作权法保护，允许非商业用途在署名 Bank of Japan 的前提下复制与引用；不得擅自篡改，商业使用及图片转载须事先获得许可。':
    'Bank of Japan website and RSS content is protected under Japanese copyright law and may be reproduced or quoted non-commercially with attribution to the Bank of Japan; unauthorized modification, commercial reuse, and image reproduction require prior permission.',
  '英格兰银行网站与 RSS 内容允许用于个人及非商业内部阅读与展示；商业再分发、改写或使用第三方金融数据须另行取得许可。':
    'Bank of England website and RSS content may be used for personal or internal non-commercial reading and display; commercial redistribution, modification, or reuse of third-party financial data requires separate permission.',
  '澳大利亚储备银行新闻稿正文按 CC BY 4.0 国际许可协议提供，署名 Reserve Bank of Australia 即可共享与使用；徽标、钞票图像及第三方数据除外。':
    'Reserve Bank of Australia media release texts are provided under CC BY 4.0 and may be shared and used with attribution to the Reserve Bank of Australia; logos, banknote images, and third-party data are excluded.',
  'arXiv 明确允许检索、存储、转换与分享描述性元数据（CC0）；本产品仅展示标题、摘要元数据、作者与链接，不镜像 PDF 或源码。论文版权仍属作者，预印本未经同行评审。':
    'arXiv explicitly permits retrieving, storing, transforming, and sharing descriptive metadata (CC0); this product shows only titles, abstract metadata, authors, and links, without mirroring PDFs or source files. Paper copyright remains with the authors, and preprints are not peer-reviewed.',
  'NASA 内容通常不受美国版权保护，使用需注明 NASA 且不得暗示 NASA 背书；本产品仅使用官方内容的标题、短描述与链接，不使用图像或全文。第三方材料与引用除外。':
    'NASA content is generally not subject to U.S. copyright and may be used with attribution without implying NASA endorsement; this product uses only official titles, short descriptions, and links, without images or full text. Excludes third-party material and citations.',
  '欧洲航天局（ESA）RSS 供个人非商业信息订阅阅读；未经 ESA 事先书面授权不得商业利用、大范围再分发或冒充官方背书。本产品仅作本地个人阅读展示标题、短摘要与原文链接。':
    'European Space Agency (ESA) RSS feeds are provided for personal, non-commercial informational reading; commercial exploitation, broad redistribution, or implied endorsement requires prior written authorization from ESA. This local reader displays titles, short summaries, and official links.',
  'Google DeepMind 官方 google-gemma/docs 文档源码以 Apache-2.0 授权。环讯提取发布条目、保留来源短描述并生成中文标题；完整许可证随离线页面提供。仅记录官方文档明确的模型发布，不下载模型、图片或全文；文档许可不等于各模型权重许可，亦不代表 Google 背书。':
    'Official Google DeepMind google-gemma/docs documentation source is licensed under Apache-2.0. Atlas extracts release entries, retains short source descriptions, and adds Chinese titles; the full license is bundled with this offline page. Only documented official model releases are listed without downloading weights, images, or full docs; the documentation license does not govern model weight licenses or imply Google endorsement.',
  'USGS 地震目录通常属美国政府公开数据，可复制与再分发并须署名 USGS；本公开候选只保留结构化地震元数据，不据震级推断伤亡、破坏或灾害严重程度。第三方内容除外。':
    'USGS earthquake catalogs are generally U.S. government public data eligible for copying and redistribution with attribution to USGS; this public candidate retains only structured earthquake metadata and does not infer casualties, damage, or hazard severity from magnitude. Excludes third-party content.',
  '美联储理事会网站内容除特别标注外属公有领域，可复制与分发，但须注明理事会为来源；第三方材料、照片、图形及印章/徽标除外。本公开候选只链接官方新闻稿，不转载标题或摘要。':
    'Content on the Federal Reserve Board website is in the public domain unless otherwise noted and may be copied and distributed with attribution to the Board; excludes third-party material, photographs, graphics, and seals/logos. This public candidate links only to official press releases without republishing titles or summaries.',
  '欧洲央行允许在注明来源、保证信息准确并说明修改的前提下免费使用网站信息；含作者署名的文件如工作论文、不定期论文以不同出版物形式再版须事先书面授权。出售含其信息的文件须在付费前及每次访问时告知信息可免费获取。本公开候选只链接官方页面，不构成付费内容或全文再分发授权。':
    'The European Central Bank permits free use of website information with attribution, accuracy, and disclosure of modifications; republishing authored papers such as working or occasional papers requires prior written permission. Paid redistribution requires disclosing prior to payment and on each access that the data is freely available. This public candidate links only to official pages and grants no paid or full-text redistribution rights.',
  'arXiv 允许检索、存储、转换与分享描述性元数据（CC0 1.0）；论文内容版权仍属作者，不得存储或提供 PDF/源码，除非许可允许。本公开候选只保留题录并链接摘要页，不包含论文全文或摘要正文。':
    'arXiv permits retrieving, storing, transforming, and sharing descriptive metadata (CC0 1.0); paper copyright remains with the authors and PDFs/source files may not be stored or served unless permitted by license. This public candidate retains bibliographic records and links to official abstract pages without full text or abstract bodies.',
  'NASA 内容通常不受美国版权保护，可在不暗示 NASA 背书的前提下作事实性使用并注明 NASA；第三方版权材料、徽标、可识别人物及商业/周边用途适用额外条件。本公开候选只链接官方页面，不使用图片、徽标或全文。':
    'NASA content is generally not subject to U.S. copyright and may be used factually with attribution without implying NASA endorsement; third-party materials, logos, identifiable individuals, and commercial or merchandise uses carry additional conditions. This public candidate links only to official pages without images, logos, or full text.',
  'google-gemma/docs 文档源码以 Apache-2.0 授权；本公开候选摘录官方发布条目并生成中文标题，已注明修改并随附许可证。文档许可不等于各模型权重许可，也不表示 Google 或 DeepMind 背书。':
    'The google-gemma/docs documentation source is licensed under Apache-2.0; this public candidate excerpts official release entries with Chinese titles, states modifications, and bundles the license. The documentation license does not equal model weight licenses and does not imply endorsement by Google or DeepMind.',
};

/**
 * Translates known built-in source rights statements into English when `locale === 'en'`.
 * Unknown or custom rights strings pass through verbatim.
 */
export function sourceRights(value: string, locale: Locale): string {
  if (locale === 'zh-CN') return value;
  return englishSourceRights[value] ?? value;
}

export function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

export function eventTitle(event: NewsEvent, locale: Locale): string {
  if (locale === 'en') return event.titleOriginal.trim() || event.title;
  return event.title.trim() || event.titleOriginal;
}

export function getStoredLocale(): Locale {
  try {
    if (typeof window === 'undefined') return 'zh-CN';
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'en' || stored === 'zh-CN') return stored;
    const browserLang = typeof navigator !== 'undefined' ? navigator.language || '' : '';
    return browserLang && !/^zh\b/i.test(browserLang) ? 'en' : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export function storeLocale(locale: Locale): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Language choice remains usable for this session when storage is unavailable.
  }
}