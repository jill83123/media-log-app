import { db } from '@/db'
import type { Progress, ProgressLog, Rec, Status, Work, WorkNote, WorkType } from '@/db/types'
import { uid } from './id'
import { addDays, today } from './date'
import { pruneLocalImages } from './imageGc'
import { createSeries, createTag, emptyProgress, progressLogId } from './repo'

/**
 * Covers that were looked up and checked against the title (AniList, Wikipedia / Wikimedia Commons).
 * A work that is not listed has no cover on purpose: a missing picture is better than a wrong one.
 */
const AL = 'https://s4.anilist.co/file/anilistcdn/media/'
const COVERS: Record<string, string> = {
  '葬送的芙莉蓮': AL + 'anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg',
  '鏈鋸人': AL + 'manga/cover/large/bx105778-euxXZEIfDY2u.png',
  '怪獸8號': AL + 'manga/cover/large/bx177806-FJZ4FLhWjRzX.jpg',
  '航海王': AL + 'anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  'Silent Witch 沉默魔女的祕密 1': AL + 'manga/cover/large/bx136833-gbVDB7CgEUYT.jpg',
  '寄生獸': AL + 'manga/cover/large/bx30401-siY6wmwnHFi6.png',
  '歡迎來到實力至上主義的教室': AL + 'manga/cover/large/bx96798-SIQLQqS8HO9h.jpg',
  '刀劍神域': AL + 'manga/cover/large/nx51479-ufMREP6e1UkT.jpg',
  '膽大黨': AL + 'anime/cover/large/bx171018-60q1B6GK2Ghb.jpg',
  '一拳超人': AL + 'anime/cover/large/bx21087-B5DHjqZ3kW4b.jpg',
  '藥師少女的獨語': AL + 'anime/cover/large/bx161645-QLbzHXiYRgV2.jpg',
  '間諜過家家': AL + 'anime/cover/large/bx140960-Kb6R5nYQfjmP.jpg',
  '蟲師': AL + 'anime/cover/large/bx457-l6cTtNgI9Bi6.png',
  '夏日重現': AL + 'anime/cover/large/bx129201-HJBauga2be8I.png',
  '孤獨搖滾！': AL + 'anime/cover/large/bx130003-HTDmeL4RGeJ4.png',
  '書蟲公主': AL + 'anime/cover/large/bx144533-DqgPeBmWZPYQ.jpg',
  '排球少年!!': AL + 'anime/cover/large/bx20464-ooZUyBe4ptp9.png',
  '鬼滅之刃': AL + 'anime/cover/large/bx101922-WBsBl0ClmgYL.jpg',
  '進擊的巨人': AL + 'manga/cover/large/bx53390-1RsuABC34P9D.jpg',
  '1984': 'https://upload.wikimedia.org/wikipedia/commons/5/51/1984_first_edition_cover.jpg',
  '你的名字。': 'https://upload.wikimedia.org/wikipedia/en/0/0b/Your_Name_poster.png',
  '奧本海默': 'https://upload.wikimedia.org/wikipedia/en/4/4a/Oppenheimer_%28film%29.jpg',
}

const p = (current: number, total: number, unit: string, infinite = false): Progress => ({ current, total, unit, infinite })

interface Round {
  status: Status
  rating?: number | null
  start: string
  end: string
  review?: string
}
interface Row extends Round {
  title: string
  type: WorkType
  progress: Progress
  extra?: object
  /** an earlier round of the same work, finished before this one */
  prev?: Round
  /** notes written along the way: [how far through the round (1 = the first tenth), text] */
  notes?: [number, string][]
}

/** a small deterministic random generator, so the sample data looks the same every time */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

/** how much a sitting usually covers, per unit */
const STEP: Record<string, [number, number]> = { 集: [1, 3], 話: [3, 8], 章: [1, 3], 頁: [20, 60], '%': [5, 18], 冊: [1, 1] }
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/**
 * The days a round was worked on, the way someone really does it: a few sittings with days skipped in between,
 * the first on the start day and the last on `last` (or a day or two before it while it is still going).
 * Most days know where they started from; a few were filled in afterwards and only know where they got to.
 */
function sittings(rec: { id: string; workId: string }, unit: string, start: string, last: string, final: number, exact: boolean, at: number): ProgressLog[] {
  const span = daysBetween(start, last) + 1
  if (start.length !== 10 || span < 2 || final <= 0) return []
  const rand = rng(rec.id + start)
  const [lo, hi] = STEP[unit] ?? [1, 3]
  const values: number[] = []
  for (let v = 0; v < final; ) {
    v = Math.min(final, v + lo + Math.floor(rand() * (hi - lo + 1)))
    values.push(v)
  }
  // nobody logs every single day for months: fewer sittings, each covering more
  const most = Math.min(span, Math.max(2, Math.round(span * 0.6)), 80)
  while (values.length > most) values.splice(Math.floor(rand() * (values.length - 1)), 1)
  const m = values.length
  const lastOff = exact ? span - 1 : Math.max(0, span - 1 - Math.floor(rand() * 3))
  const offs = new Set<number>([lastOff])
  if (m > 1) offs.add(0)
  while (offs.size < m) offs.add(Math.floor(rand() * span))
  const days = [...offs].sort((a, b) => a - b)
  return days.map((off, i) => {
    const date = addDays(start, off)
    const log: ProgressLog = { id: progressLogId(rec.id, date), updatedAt: at, workId: rec.workId, recordId: rec.id, date, value: values[i]! }
    if (i === 0 || rand() > 0.15) log.from = i === 0 ? 0 : values[i - 1]!
    return log
  })
}

/** every table is emptied the way the app does it (rows marked deleted), so a synced device forgets them too */
export async function clearAll(): Promise<void> {
  const at = Date.now()
  for (const t of [db.works, db.records, db.notes, db.progressLogs, db.series, db.tags, db.categories]) {
    await (t as unknown as { toCollection(): { modify(f: object): Promise<unknown> } }).toCollection().modify({ deleted: true, updatedAt: at })
  }
  await pruneLocalImages()
}

/** wipes everything and loads the sample data again */
export async function resetDemo(): Promise<void> {
  await clearAll()
  await loadDemo()
}

/** sample data for trying the app out (reachable from #/dev) */
export async function loadDemo(): Promise<void> {
  const t = today()
  const d = (n: number) => addDays(t, -n)
  const tagLight = await createTag('輕鬆')
  const tagMust = await createTag('必看')
  const tagHeal = await createTag('治癒')
  const tagCry = await createTag('催淚')
  const tagBrain = await createTag('燒腦')
  const tagMusic = await createTag('音樂')
  const catFantasy = await createTag('奇幻')
  const catDaily = await createTag('日常')
  const catScifi = await createTag('科幻')
  const catAction = await createTag('熱血')
  const series = await createSeries('Silent Witch')

  const rows: Row[] = [
    // ---- in progress ----
    { title: '葬送的芙莉蓮', type: 'anime', status: 'doing', progress: p(18, 28, '集'), start: d(12), end: '', extra: { tagIds: [tagMust, tagHeal], categoryId: catFantasy, year: '2023' },
      notes: [[3, '辛美爾的葬禮那段看得好難過'], [7, '一級魔法使考試開始，節奏變快了'], [10, '菲倫的成長線很棒']] },
    { title: '鏈鋸人', type: 'manga', status: 'doing', progress: p(96, 180, '話'), start: d(45), end: '', extra: { categoryId: catAction, creators: '藤本樹' }, notes: [[6, '瑪奇瑪的真面目']] },
    { title: '怪獸8號', type: 'manga', status: 'doing', progress: p(112, 120, '話'), start: d(25), end: '', extra: { categoryId: catAction, creators: '松本直也' } },
    { title: '航海王', type: 'anime', status: 'doing', progress: p(1090, 0, '集', true), start: d(240), end: '', extra: { categoryId: catAction, tagIds: [tagMust] }, notes: [[4, '和之國篇終於進入尾聲'], [9, '追上最新進度了']] },
    { title: '挪威的森林', type: 'novel', status: 'doing', progress: p(120, 380, '頁'), start: d(9), end: '', extra: { creators: '村上春樹' }, notes: [[5, '渡邊與直子重逢那一段']] },
    { title: 'Silent Witch -another- 一步登天的結界魔術師〈上〉', type: 'novel', status: 'doing', progress: p(7, 100, '%'), start: d(38), end: '', extra: { seriesId: series, seriesOrder: 1, tagIds: [tagLight], categoryId: catFantasy, creators: '依空まつり' } },
    { title: '藍色時期', type: 'manga', status: 'doing', progress: p(40, 62, '話'), start: d(31), end: '', extra: { creators: '山口飛翔', tagIds: [tagMust] } },
    // ---- paused ----
    { title: '寄生獸', type: 'manga', status: 'paused', progress: p(24, 64, '話'), start: d(75), end: '', extra: { creators: '岩明均', categoryId: catScifi } },
    { title: '歡迎來到實力至上主義的教室', type: 'novel', status: 'paused', progress: p(5, 11, '冊'), start: d(170), end: '', extra: { creators: '衣笠彰梧' } },
    { title: '絕命毒師', type: 'series', status: 'paused', progress: p(22, 62, '集'), start: d(140), end: '', extra: { tagIds: [tagBrain] } },
    // ---- dropped ----
    { title: '壞建築傳說', type: 'series', status: 'dropped', progress: p(2, 10, '集'), rating: 1.5, start: d(33), end: d(30), review: '設定很有趣，但前兩集的節奏拖得讓我看不下去。' },
    { title: '刀劍神域', type: 'novel', status: 'dropped', progress: p(2, 27, '冊'), rating: 2.5, start: d(260), end: d(240) },
    // ---- to watch ----
    { title: '膽大黨', type: 'anime', status: 'todo', progress: p(0, 12, '集'), start: '', end: '' },
    { title: '三體', type: 'novel', status: 'todo', progress: p(0, 0, '頁'), start: '', end: '', extra: { creators: '劉慈欣', categoryId: catScifi } },
    { title: '一拳超人', type: 'anime', status: 'todo', progress: p(0, 12, '集'), start: '', end: '' },
    { title: '芙莉蓮 官方設定集', type: 'manga', status: 'todo', progress: p(0, 0, '頁'), start: '', end: '' },
    // ---- finished: anime ----
    { title: '藥師少女的獨語', type: 'anime', status: 'done', progress: p(24, 24, '集'), rating: 4.5, start: d(130), end: d(104), extra: { tagIds: [tagMust], categoryId: catFantasy, year: '2023' }, review: '貓貓的推理與宮廷氛圍都很對味，壬氏的反差也好笑。',
      notes: [[2, '第一次出現毒物的橋段'], [6, '壬氏的真實身分']] },
    { title: '間諜過家家', type: 'anime', status: 'done', progress: p(25, 25, '集'), rating: 4.5, start: d(150), end: d(140), extra: { tagIds: [tagLight, tagHeal], categoryId: catDaily, year: '2022' }, review: '二刷反而更有感觸，安妮亞的表情包太多了。',
      prev: { status: 'done', rating: 4, start: d(560), end: d(548) } },
    { title: '蟲師', type: 'anime', status: 'done', progress: p(26, 26, '集'), rating: 5, start: d(300), end: d(270), extra: { tagIds: [tagHeal, tagMust], categoryId: catFantasy, year: '2005' }, review: '一集一集慢慢看，睡前最適合。每一則故事都有餘韻。' },
    { title: '夏日重現', type: 'anime', status: 'done', progress: p(25, 25, '集'), rating: 4, start: d(210), end: d(190), extra: { categoryId: catScifi, tagIds: [tagBrain], year: '2022' } },
    { title: '孤獨搖滾！', type: 'anime', status: 'done', progress: p(12, 12, '集'), rating: 4.5, start: d(95), end: d(88), extra: { tagIds: [tagLight, tagMusic], categoryId: catDaily, year: '2022' }, review: '波奇的內心戲和演奏場面都太強，結束後馬上去聽了原聲帶。' },
    { title: '書蟲公主', type: 'anime', status: 'done', progress: p(12, 12, '集'), start: d(60), end: t.slice(0, 7), extra: { categoryId: catFantasy } },
    { title: '排球少年!!', type: 'anime', status: 'done', progress: p(85, 85, '集'), rating: 5, start: d(420), end: d(360), extra: { tagIds: [tagMust, tagCry], categoryId: catAction }, review: '每一場比賽都讓人手心冒汗，烏野對白鳥澤那場尤其。' },
    { title: '鬼滅之刃', type: 'anime', status: 'done', progress: p(26, 26, '集'), rating: 4, start: d(500), end: d(490), extra: { categoryId: catAction } },
    // ---- finished: manga / novels ----
    { title: '進擊的巨人', type: 'manga', status: 'done', progress: p(139, 139, '話'), rating: 4.5, start: d(330), end: d(250), extra: { tagIds: [tagMust, tagBrain], categoryId: catAction, creators: '諫山創' }, review: '前期的伏筆回收得很漂亮，最終回見仁見智，我還是給高分。' },
    { title: 'Silent Witch 沉默魔女的祕密 1', type: 'novel', status: 'done', progress: p(100, 100, '%'), rating: 4.5, start: d(80), end: d(70), extra: { seriesId: series, seriesOrder: 0, tagIds: [tagLight, tagMust], categoryId: catFantasy, creators: '依空まつり' }, review: '節奏很好，莫妮卡太可愛了。',
      notes: [[3, '莫妮卡第一次站上舞台，緊張得我也跟著緊張'], [8, '終於有朋友了']] },
    { title: '百年孤寂', type: 'novel', status: 'done', progress: p(100, 100, '%'), rating: 5, start: d(240), end: d(215), extra: { creators: '賈西亞·馬奎斯', tagIds: [tagMust], year: '1967' }, review: '人物名字重複太多，要邊看邊畫家族圖。但最後一頁真的是震撼。' },
    { title: '房思琪的初戀樂園', type: 'novel', status: 'done', progress: p(100, 100, '%'), start: d(110), end: d(102), extra: { creators: '林奕含' } },
    { title: '解憂雜貨店', type: 'novel', status: 'done', progress: p(100, 100, '%'), rating: 4, start: d(380), end: d(372), extra: { creators: '東野圭吾', tagIds: [tagHeal] } },
    { title: '1984', type: 'novel', status: 'done', progress: p(100, 100, '%'), rating: 4.5, start: '2025-03', end: '2025-04', extra: { creators: '喬治·歐威爾', tagIds: [tagBrain] }, review: '讀完比開頭更壓抑，現實感太強。' },
    // ---- finished: movies and series ----
    { title: '你的名字。', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 4.5, start: d(60), end: d(60), extra: { creators: '新海誠', tagIds: [tagCry], year: '2016' }, review: '重看一次，還是會在回溯時鼻酸。',
      prev: { status: 'done', rating: 5, start: d(520), end: d(520), review: '第一次看，被畫面和音樂完全擊中。' } },
    { title: '奧本海默', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 4, start: d(20), end: d(20), extra: { creators: '克里斯多福·諾蘭', year: '2023' } },
    { title: '小森林 夏秋篇', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 4, start: d(5), end: d(5), extra: { tagIds: [tagHeal], categoryId: catDaily } },
    { title: '蜘蛛人：新宇宙', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 4.5, start: d(200), end: d(200), extra: { year: '2018' } },
    { title: '千與千尋', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 5, start: '2023', end: '2023', extra: { creators: '宮崎駿', year: '2001' } },
    { title: '沙丘：第二部', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 4, start: d(280), end: d(280), extra: { year: '2024', categoryId: catScifi } },
    { title: '黑執事', type: 'series', status: 'done', progress: p(8, 8, '集'), rating: 3.5, start: d(95), end: d(88) },
    { title: '怪奇物語', type: 'series', status: 'done', progress: p(34, 34, '集'), rating: 4, start: d(450), end: d(380), extra: { tagIds: [tagBrain] } },
    { title: '良善之地', type: 'series', status: 'done', progress: p(53, 53, '集'), rating: 4.5, start: d(330), end: d(310), extra: { tagIds: [tagLight, tagBrain] }, review: '第一季最後的反轉讓我整個人坐起來。' },
    // ---- more in progress ----
    { title: '黃金神威', type: 'manga', status: 'doing', progress: p(142, 317, '話'), start: d(18), end: '', extra: { creators: '野田サトル', categoryId: catAction, tagIds: [tagMust] }, notes: [[5, '杉元和白石的搭檔默契太好笑'], [9, '阿席莉帕開始有存在感了']] },
    { title: '咒術迴戰', type: 'anime', status: 'doing', progress: p(17, 47, '集'), start: d(8), end: '', extra: { categoryId: catAction, year: '2020' } },
    { title: '白夜行', type: 'novel', status: 'doing', progress: p(45, 100, '%'), start: d(6), end: '', extra: { creators: '東野圭吾', tagIds: [tagBrain] }, notes: [[6, '兩條線終於開始交會']] },
    // ---- more paused / dropped ----
    { title: '東京喰種', type: 'manga', status: 'paused', progress: p(80, 144, '話'), start: d(110), end: '', extra: { creators: '石田スイ', categoryId: catAction } },
    { title: '哈利波特：神秘的魔法石', type: 'novel', status: 'paused', progress: p(150, 320, '頁'), start: d(60), end: '', extra: { creators: 'J.K.羅琳', categoryId: catFantasy } },
    { title: '約定的夢幻島 第二季', type: 'anime', status: 'dropped', progress: p(4, 11, '集'), rating: 2, start: d(70), end: d(66), review: '跟第一季的緊張感差太多，沒有繼續看下去。' },
    // ---- more to watch ----
    { title: '凡人修仙傳', type: 'anime', status: 'todo', progress: p(0, 0, '集'), start: '', end: '' },
    { title: '我獨自升級', type: 'manga', status: 'todo', progress: p(0, 200, '話'), start: '', end: '' },
    { title: '怪物', type: 'manga', status: 'todo', progress: p(0, 162, '話'), start: '', end: '', extra: { creators: '浦澤直樹', tagIds: [tagBrain] } },
    { title: '十二國記', type: 'novel', status: 'todo', progress: p(0, 0, '冊'), start: '', end: '', extra: { creators: '小野不由美', categoryId: catFantasy } },
    { title: '星際效應', type: 'movie', status: 'todo', progress: p(0, 100, '%'), start: '', end: '', extra: { year: '2014', categoryId: catScifi } },
    { title: '人生切割術', type: 'series', status: 'todo', progress: p(0, 19, '集'), start: '', end: '', extra: { categoryId: catScifi } },
    // ---- more finished: anime ----
    { title: '新世紀福音戰士', type: 'anime', status: 'done', progress: p(26, 26, '集'), rating: 5, start: d(600), end: d(570), extra: { categoryId: catScifi, tagIds: [tagMust, tagBrain], year: '1995' }, review: '看不懂的地方很多，但最後兩集的衝擊很久都忘不掉。' },
    { title: '死亡筆記本', type: 'anime', status: 'done', progress: p(37, 37, '集'), rating: 5, start: d(700), end: d(650), extra: { tagIds: [tagBrain], year: '2006' } },
    { title: '約定的夢幻島', type: 'anime', status: 'done', progress: p(12, 12, '集'), rating: 4.5, start: d(430), end: d(420), extra: { tagIds: [tagBrain], year: '2019' } },
    { title: '我的英雄學院', type: 'anime', status: 'done', progress: p(25, 25, '集'), rating: 4, start: d(380), end: d(350), extra: { categoryId: catAction } },
    { title: 'Lycoris Recoil', type: 'anime', status: 'done', progress: p(13, 13, '集'), rating: 4, start: d(280), end: d(272), extra: { tagIds: [tagLight], categoryId: catAction, year: '2022' } },
    { title: '輝夜姬想讓人告白', type: 'anime', status: 'done', progress: p(12, 12, '集'), rating: 4.5, start: d(190), end: d(182), extra: { tagIds: [tagLight], categoryId: catDaily } },
    // ---- more finished: manga / novels ----
    { title: '灌籃高手', type: 'manga', status: 'done', progress: p(31, 31, '冊'), rating: 5, start: d(720), end: d(690), extra: { creators: '井上雄彥', tagIds: [tagMust, tagCry], categoryId: catAction }, review: '最後那場比賽幾乎沒有台詞，卻是看過最熱血的一段。' },
    { title: '鋼之鍊金術師', type: 'manga', status: 'done', progress: p(108, 108, '話'), rating: 5, start: d(500), end: d(440), extra: { creators: '荒川弘', tagIds: [tagMust], categoryId: catFantasy } },
    { title: '追風箏的孩子', type: 'novel', status: 'done', progress: p(100, 100, '%'), rating: 4.5, start: d(560), end: d(548), extra: { creators: '卡勒德·胡賽尼', tagIds: [tagCry] } },
    { title: '小王子', type: 'novel', status: 'done', progress: p(100, 100, '%'), rating: 5, start: d(150), end: d(148), extra: { creators: '聖修伯里', tagIds: [tagHeal] }, review: '每隔幾年重讀，每次抓到的句子都不一樣。' },
    { title: '人間失格', type: 'novel', status: 'done', progress: p(100, 100, '%'), rating: 4, start: d(330), end: d(327), extra: { creators: '太宰治' } },
    { title: '自私的基因', type: 'novel', status: 'done', progress: p(100, 100, '%'), rating: 3.5, start: d(400), end: d(370), extra: { creators: '理查·道金斯', tagIds: [tagBrain] } },
    { title: '嫌疑犯X的獻身', type: 'novel', status: 'done', progress: p(100, 100, '%'), rating: 4.5, start: d(260), end: d(256), extra: { creators: '東野圭吾', tagIds: [tagBrain] }, review: '最後的真相出來時，整個人愣住。' },
    // ---- more finished: movies and series ----
    { title: '寄生上流', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 5, start: d(310), end: d(310), extra: { creators: '奉俊昊', year: '2019' } },
    { title: '駭客任務', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 4.5, start: d(90), end: d(90), extra: { year: '1999', categoryId: catScifi, tagIds: [tagBrain] }, prev: { status: 'done', rating: 4, start: d(900), end: d(900) } },
    { title: '天能', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 3.5, start: d(240), end: d(240), extra: { creators: '克里斯多福·諾蘭', year: '2020', categoryId: catScifi } },
    { title: '花樣年華', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 4.5, start: d(120), end: d(120), extra: { creators: '王家衛', year: '2000' } },
    { title: '蝙蝠俠：黑暗騎士', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 5, start: d(350), end: d(350), extra: { year: '2008', categoryId: catAction } },
    { title: '天外奇蹟', type: 'movie', status: 'done', progress: p(100, 100, '%'), rating: 4.5, start: d(40), end: d(40), extra: { year: '2009', tagIds: [tagHeal, tagCry] } },
    { title: '想見你', type: 'series', status: 'done', progress: p(13, 13, '集'), rating: 5, start: d(300), end: d(290), extra: { tagIds: [tagCry, tagMust] }, review: '時間線交錯得很漂亮，結局讓人哭完又笑。' },
    { title: '黑鏡', type: 'series', status: 'done', progress: p(22, 22, '集'), rating: 4, start: d(200), end: d(170), extra: { tagIds: [tagBrain], categoryId: catScifi } },
    { title: '魷魚遊戲', type: 'series', status: 'done', progress: p(9, 9, '集'), rating: 3.5, start: d(420), end: d(418) },
  ]

  // everything is built in memory and written in one go, so the list fills at once instead of row by row
  const at = Date.now()
  const works: Work[] = []
  const records: Rec[] = []
  const notesOut: WorkNote[] = []
  const logsOut: ProgressLog[] = []
  const makeRec = (workId: string, round: number, patch: Partial<Rec>): Rec => ({
    id: uid(), updatedAt: at, createdAt: at, workId, round, status: 'todo', progress: emptyProgress(), rating: null, start: '', end: '', ...patch,
  })
  for (const r of rows) {
    const { categoryId, ...extra } = (r.extra ?? {}) as { categoryId?: string; tagIds?: string[] }
    const w: Work = { id: uid(), updatedAt: at, createdAt: at, tagIds: [], title: r.title, type: r.type, cover: COVERS[r.title], ...r.extra, ...extra, ...(categoryId ? { tagIds: [...(extra.tagIds ?? []), categoryId] } : {}) }
    delete w.categoryId
    works.push(w)
    let round = 1
    if (r.prev) {
      const prevRec = makeRec(w.id, round++, { status: r.prev.status, progress: { ...r.progress, current: r.progress.total || r.progress.current }, rating: r.prev.rating ?? null, start: r.prev.start, end: r.prev.end })
      records.push(prevRec)
      logsOut.push(...sittings(prevRec, r.progress.unit, r.prev.start, r.prev.end, prevRec.progress.current, true, at))
      if (r.prev.review) notesOut.push({ id: uid(), updatedAt: at, workId: w.id, date: r.prev.end, body: r.prev.review })
    }
    const rec = makeRec(w.id, round, { status: r.status, progress: r.progress, rating: r.rating ?? null, start: r.start, end: r.end })
    records.push(rec)
    // a paused round stopped somewhere along the way; a dropped or finished one stopped on its end day; one in progress goes up to now
    const span = r.start.length === 10 ? daysBetween(r.start, r.end.length === 10 ? r.end : t) + 1 : 0
    const stop = r.end.length === 10 ? r.end : r.status === 'paused' ? addDays(r.start, Math.floor(span * 0.55)) : t
    logsOut.push(...sittings(rec, r.progress.unit, r.start, stop, r.progress.current, r.status !== 'doing', at))
    if (r.review) notesOut.push({ id: uid(), updatedAt: at, workId: w.id, date: r.end, body: r.review })
    // notes written along the way are spread from the start to the end (or to now)
    if (r.notes && r.start.length === 10) {
      const last = r.end.length === 10 ? r.end : t
      const days = Math.max(0, Math.round((Date.parse(last) - Date.parse(r.start)) / 86400000))
      for (const [i, body] of r.notes) {
        const day = addDays(r.start, Math.round((days * i) / 10))
        // the note says how far it was written: that tenth of where the round got to
        notesOut.push({ id: uid(), updatedAt: at, workId: w.id, kind: 'note', date: day > t ? t : day, progress: Math.max(1, Math.round((r.progress.current * i) / 10)), body })
      }
    }
  }
  // a second round of the first finished light novel
  const first = works.find((w) => w.title.startsWith('Silent Witch 沉默'))
  if (first) {
    const again = makeRec(first.id, 2, { status: 'doing', progress: p(12, 100, '%'), start: d(3) })
    records.push(again)
    logsOut.push(...sittings(again, '%', d(3), t, 12, false, at))
  }
  await db.transaction('rw', db.works, db.records, db.notes, db.progressLogs, async () => {
    await db.works.bulkPut(works)
    await db.records.bulkPut(records)
    await db.notes.bulkPut(notesOut)
    await db.progressLogs.bulkPut(logsOut)
  })
}
