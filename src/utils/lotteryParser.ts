/**
 * 六合彩解析逻辑
 * 基准年：2026 (马年)
 */

export const ZODIAC_LIST = ['马', '蛇', '龙', '兔', '虎', '牛', '鼠', '猪', '狗', '鸡', '猴', '羊'] as const;
export type Zodiac = typeof ZODIAC_LIST[number];

export const COLOR_MAP = {
  '红': [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
  '蓝': [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
  '绿': [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49],
} as const;

export const HOMOPHONES: Record<string, string> = {
  '要': '1',
  '幺': '1',
  '两': '2',
  '二': '2',
  '三': '3',
  '四': '4',
  '五': '5',
  '六': '6',
  '七': '7',
  '八': '8',
  '勾': '9',
  '九': '9',
  '实': '10',
  '十': '10',
};

/**
 * 获取生肖对应的号码
 * 2026年是马年，马对应 01, 13, 25, 37, 49
 */
export function getNumbersByZodiac(zodiac: string): number[] {
  const index = ZODIAC_LIST.indexOf(zodiac as any);
  if (index === -1) return [];

  const numbers: number[] = [];
  for (let i = 1; i <= 49; i++) {
    if ((i - 1) % 12 === index) {
      numbers.push(i);
    }
  }
  return numbers;
}

export interface ParseResult {
  numbers: number[];
  amount: number;
  raw: string;
  type: 'single' | '三中三' | '二中二' | '特碰';
  banker?: number; // For 特碰
}

/**
 * 将中文数字转换为阿拉伯数字 (支持到百位，满足金额需求)
 */
function chineseToNumber(chinese: string): number {
  if (/^\d+$/.test(chinese)) return parseInt(chinese, 10);
  
  const map: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '百': 100
  };
  
  let result = 0;
  let temp = 0;
  
  for (let i = 0; i < chinese.length; i++) {
    const char = chinese[i];
    const val = map[char];
    if (val === undefined) continue;
    
    if (val === 10 || val === 100) {
      if (temp === 0) temp = 1;
      result += temp * val;
      temp = 0;
    } else {
      temp = val;
    }
  }
  return result + temp;
}

/**
 * 解析输入字符串
 * 遵循用户最新指令：
 * 1. “各”、“字”或其谐音之后的第一组数字为金额。
 * 2. “各”之前的生肖和号码独立计算（不进行去重）。
 * 3. 大小单双组合逻辑：大单(25-49单), 大双(25-49双), 小单(1-24单), 小双(1-24双)。
 */
export function parseInput(input: string): ParseResult[] {
  // 统一替换谐音 (针对金额前的关键词)
  let processed = input;
  
  // 扩充关键词库，涵盖所有对话中出现的变体
  // 注意：元、米、斤、块、位 等通常作为金额后缀，不应作为起始关键词，否则会误切分（如“10元15号”会被切成“10”和“15号”）
  const KEYWORDS = [
    '各', '个', '字', '每', '打', '买', '下', 'x', 'X', '￥', ':', '=', '/', 
    '数', '：', '＝', '每数', '每个', '每号', '各是', '个是'
  ];
  const IGNORE_TARGETS = ['合计', '总计', '总共', '共计', '累计', '合计金额', '总额'];
  const HEADER_KEYWORDS = [
    '新澳门', '澳门特码', '新奥特码', '澳门特', '澳门', '特码', '澳特', '特',
    '上报数据明细', '数据明细', '明细', '报单', '报单明细', '清单', '下注清单',
    '上报散码数据', '散码数据', '上报数据', '上报散码', '散码', '上报'
  ];

  // 1. 移除汇总信息和报头信息
  // 汇总信息通常带数字，报头通常不带或带无关数字
  const sortedIgnore = [...IGNORE_TARGETS].sort((a, b) => b.length - a.length);
  // 优化汇总正则：确保不会误删正常的投注项
  const summaryRegex = new RegExp(`(?:${sortedIgnore.join('|')})[:：]?\\s*(?:共|额|金额)?\\s*\\d+\\s*元?(?![=：＝:各个字每打买下xX￥/])`, 'gi');
  
  // 优化报头正则：只匹配行首或明显分隔符后的报头，防止误伤
  const headerRegex = new RegExp(`(?:^|[\\s。，,])(?:${HEADER_KEYWORDS.sort((a, b) => b.length - a.length).join('|')})[:：]?`, 'gi');
  
  let cleanedInput = processed.replace(summaryRegex, '');
  cleanedInput = cleanedInput.replace(headerRegex, ' ');

  // 2. 将所有行合并为一个长字符串，处理跨行指令
  // 移除多余的换行，用空格替代，使跨行的“各50”能找到前面的目标
  const unifiedInput = cleanedInput.split(/[\n\r]+/).map(l => l.trim()).filter(l => l).join(' ');
  
  const allResults: ParseResult[] = [];
  const COMBO_KEYWORDS = ['三中三', '3中3', '二中二', '2中2', '特碰', '三中二', '二中特'];
  
  // 3. 使用“金额锚点”逻辑进行切分
  const segments = splitByAnchors(unifiedInput, KEYWORDS);
  
  for (const segment of segments) {
    const results = parseSegment(segment, KEYWORDS, COMBO_KEYWORDS);
    if (results && results.length > 0) {
      allResults.push(...results);
    }
  }
  
  return allResults;
}

/**
 * 金额锚点切分算法
 * 寻找所有可能的金额点，并将之前的文本归为该金额的目标
 */
function splitByAnchors(text: string, keywords: string[]): string[] {
  const segments: string[] = [];
  
  // 排序关键词，长的在前，防止短的拦截长的
  const sortedKws = [...keywords].sort((a, b) => b.length - a.length);
  const kwPattern = sortedKws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  
  // 匹配模式：(关键词) (可选干扰) (数字) (元/米/斤等可选后缀)
  // 关键修复：将负向先行断言移动到后缀之后，防止后缀中的字符（如“一个”中的“一”）触发断言失败
  const anchorRegex = new RegExp(`(?:${kwPattern})\\s*[,，、\\s。#\\-]*\\s*(\\d+|[一二三四五六七八九十百]+)\\s*(?:元|米|斤|块|位|个|一个)?(?![\\d一二三四五六七八九十百])`, 'g');
  
  let lastIndex = 0;
  let match;
  
  while ((match = anchorRegex.exec(text)) !== null) {
    const anchorEnd = anchorRegex.lastIndex;
    // 截取从上一个锚点结束到当前锚点结束的所有内容
    const segment = text.substring(lastIndex, anchorEnd).trim();
    if (segment) {
      segments.push(segment);
    }
    lastIndex = anchorEnd;
  }
  
  // 处理可能存在的隐式末尾指令 (如 "35 100")
  const remaining = text.substring(lastIndex).trim();
  if (remaining) {
    if (/\d+|[一二三四五六七八九十百]+/.test(remaining)) {
      const implicitMatch = remaining.match(/^(.*?)(\d+|[一二三四五六七八九十百]+)\s*(?:元|米|斤|块|位|个|一个)?\D*$/);
      if (implicitMatch) {
        segments.push(remaining);
      } else if (segments.length > 0) {
        segments[segments.length - 1] += ' ' + remaining;
      }
    } else if (segments.length > 0) {
      segments[segments.length - 1] += ' ' + remaining;
    }
  }
  
  if (segments.length === 0 && /\d+/.test(text)) {
    segments.push(text);
  }
  
  return segments;
}

/**
 * 解析单个指令段 (现在返回数组，支持如 "马龙各50" 拆分为两个结果)
 */
function parseSegment(segment: string, keywords: string[], comboKeywords: string[]): ParseResult[] | null {
  // 排序关键词，长的在前
  const sortedKws = [...keywords].sort((a, b) => b.length - a.length);
  const kwPattern = sortedKws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  // 识别连码类型
  let comboType: 'single' | '三中三' | '二中二' | '特碰' = 'single';
  const lowerSegment = segment.toLowerCase();
  if (lowerSegment.includes('三中三') || lowerSegment.includes('3中3')) comboType = '三中三';
  else if (lowerSegment.includes('二中二') || lowerSegment.includes('2中2')) comboType = '二中二';
  else if (lowerSegment.includes('特碰')) comboType = '特碰';

  // 允许关键词和金额之间有干扰字符，且金额后可能有后缀
  // 同样修复先行断言位置
  const regex = new RegExp(`^(.*?)(?:${kwPattern})\\s*[,，、\\s。#\\-]*\\s*(\\d+|[一二三四五六七八九十百]+)\\s*(?:元|米|斤|块|位|个|一个)?(?![\\d一二三四五六七八九十百])(.*)$`);
  const match = segment.match(regex);
  
  let targetsStr = '';
  let amountStr = '';
  
  if (match) {
    targetsStr = match[1].trim();
    amountStr = match[2].trim();
  } else {
    // 兜底逻辑：找末尾数字
    const tailMatch = segment.match(/^(.*?)(\d+|[一二三四五六七八九十百]+)\s*(?:元|米|斤|块|位|个|一个)?\D*$/);
    if (tailMatch) {
      targetsStr = tailMatch[1].trim();
      amountStr = tailMatch[2].trim();
    }
  }

  if (!targetsStr || !amountStr) return null;

  const amount = chineseToNumber(amountStr);
  if (isNaN(amount) || amount === 0) return null;

  const results: ParseResult[] = [];

  // 如果是复式，识别胆码并作为一个整体返回
  if (comboType !== 'single') {
    const targetNumbers: number[] = [];
    let banker: number | undefined = undefined;

    if (comboType === '特碰') {
      const bankerMatch = targetsStr.match(/(\d+)\s*(?:拖|胆|带)/);
      if (bankerMatch) {
        banker = parseInt(bankerMatch[1], 10);
        targetsStr = targetsStr.replace(bankerMatch[0], ' ');
      }
    }

    const cleanNums = targetsStr.replace(/[^\d]/g, ' ');
    const numMatches = cleanNums.match(/\d+/g);
    if (numMatches) {
      numMatches.forEach(nStr => {
        const n = parseInt(nStr, 10);
        if (n >= 1 && n <= 49) targetNumbers.push(n);
      });
    }

    if (targetNumbers.length > 0) {
      results.push({
        numbers: targetNumbers,
        amount,
        raw: segment,
        type: comboType,
        banker
      });
    }
  } else {
    // 特码逻辑：拆分生肖和号码，每个生肖/号码作为一个独立结果
    // 1. 提取生肖
    ZODIAC_LIST.forEach(z => {
      const count = (targetsStr.match(new RegExp(z, 'g')) || []).length;
      for (let i = 0; i < count; i++) {
        results.push({
          numbers: getNumbersByZodiac(z),
          amount,
          raw: `${z} 各 ${amount}`,
          type: 'single'
        });
      }
    });
    
    // 兔的错别字
    const mianCount = (targetsStr.match(/免/g) || []).length;
    for (let i = 0; i < mianCount; i++) {
      results.push({
        numbers: getNumbersByZodiac('兔'),
        amount,
        raw: `兔 各 ${amount}`,
        type: 'single'
      });
    }

    // 2. 大小单双组合逻辑
    const combinations = [
      { key: '大单', filter: (n: number) => n >= 25 && n % 2 !== 0 },
      { key: '大双', filter: (n: number) => n >= 25 && n % 2 === 0 },
      { key: '小单', filter: (n: number) => n <= 24 && n % 2 !== 0 },
      { key: '小双', filter: (n: number) => n <= 24 && n % 2 === 0 },
      { key: '红单', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n % 2 !== 0 },
      { key: '红双', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n % 2 === 0 },
      { key: '蓝单', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n % 2 !== 0 },
      { key: '蓝双', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n % 2 === 0 },
      { key: '绿单', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n % 2 !== 0 },
      { key: '绿双', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n % 2 === 0 },
      { key: '红大', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n >= 25 },
      { key: '红小', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) && n <= 24 },
      { key: '蓝大', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n >= 25 },
      { key: '蓝小', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) && n <= 24 },
      { key: '绿大', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n >= 25 },
      { key: '绿小', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) && n <= 24 },
      { key: '大数', filter: (n: number) => n >= 25 },
      { key: '小数', filter: (n: number) => n <= 24 },
      { key: '大', filter: (n: number) => n >= 25 },
      { key: '小', filter: (n: number) => n <= 24 },
      { key: '单', filter: (n: number) => n % 2 !== 0 },
      { key: '双', filter: (n: number) => n % 2 === 0 },
      { key: '红', filter: (n: number) => (COLOR_MAP['红'] as unknown as number[]).includes(n) },
      { key: '蓝', filter: (n: number) => (COLOR_MAP['蓝'] as unknown as number[]).includes(n) },
      { key: '绿', filter: (n: number) => (COLOR_MAP['绿'] as unknown as number[]).includes(n) },
    ];

    let tempTargets = targetsStr;
    combinations.forEach(combo => {
      const count = (tempTargets.match(new RegExp(combo.key, 'g')) || []).length;
      for (let i = 0; i < count; i++) {
        const nums: number[] = [];
        for (let n = 1; n <= 49; n++) {
          if (combo.filter(n)) nums.push(n);
        }
        results.push({
          numbers: nums,
          amount,
          raw: `${combo.key} 各 ${amount}`,
          type: 'single'
        });
      }
      tempTargets = tempTargets.replace(new RegExp(combo.key, 'g'), ' ');
    });

    // 3. 提取数字
    const cleanNums = tempTargets.replace(/[^\d]/g, ' ');
    const numMatches = cleanNums.match(/\d+/g);
    if (numMatches) {
      numMatches.forEach(nStr => {
        const n = parseInt(nStr, 10);
        if (n >= 1 && n <= 49) {
          results.push({
            numbers: [n],
            amount,
            raw: `${n} 各 ${amount}`,
            type: 'single'
          });
        }
      });
    }
  }

  return results.length > 0 ? results : null;
}
