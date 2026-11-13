import { describe, expect, it } from 'vitest'
import { bgmType, parseBangumi, slim, parseBooks, parseDetail, parseDoubanBooks, parseDoubanSuggest, parseGoodreads, parseOpenLibrary, parseGamer, parseBookWalker } from './sources.js'

describe('Bangumi', () => {
  it('maps a subject to a result', () => {
    const [r] = parseBangumi({
      data: [{ id: 462618, name: 'サイレント・ウィッチ', name_cn: 'Silent Witch', date: '2022-04-01', platform: '漫画', images: { common: 'http://lain.bgm.tv/a.jpg' }, infobox: [{ key: '作者', value: '依空まつり' }] }],
    })
    expect(r).toMatchObject({ source: 'bangumi', id: '462618', title: 'Silent Witch', originalTitle: 'サイレント・ウィッチ', year: '2022', type: 'manga', creators: '依空まつり', cover: 'https://lain.bgm.tv/a.jpg' })
  })
  it('derives the type from the platform', () => {
    expect(bgmType('TV')).toBe('anime')
    expect(bgmType('小说')).toBe('lightnovel')
    expect(bgmType('剧场版')).toBe('movie')
    expect(bgmType('', 'book')).toBe('book')
  })
})

describe('Douban', () => {
  it('reads the movie suggest list', () => {
    const [r] = parseDoubanSuggest([{ id: '35593344', title: '奥本海默', sub_title: 'Oppenheimer', year: '2023', img: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p1.jpg', episode: '' }])
    expect(r).toMatchObject({ id: '35593344', title: '奥本海默', originalTitle: 'Oppenheimer', year: '2023', type: 'movie' })
    expect(r.cover).toContain('m_ratio_poster')
  })
  it('reads the book search page and skips series rows', () => {
    const data = {
      items: [
        { tpl_name: 'search_simple', id: 1, title: '[丛书] x', url: 'u' },
        { tpl_name: 'search_subject', id: 2, title: 'Silent Witch', abstract: '依空まつり / 台灣角川 / 2022-5 / NT$220', cover_url: 'https://img3.doubanio.com/view/subject/m/public/s1.jpg', url: 'https://book.douban.com/subject/2/' },
      ],
    }
    const html = `<script>\nwindow.__DATA__ = ${JSON.stringify(data)};\n</script>`
    const rows = parseDoubanBooks(html, 'lightnovel')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: '2', creators: '依空まつり', year: '2022', type: 'lightnovel' })
    expect(rows[0].cover).toContain('/l/public/')
  })
  it('returns nothing for a page without data', () => {
    expect(parseDoubanBooks('<html></html>')).toEqual([])
  })
})

describe('博客來', () => {
  const html = `<div class="table-td" id="prod-itemlist-0011055852">
<div class="box"><img class="b-lazy" src="data:image/gif;base64,AAA" data-src="https://im1.book.com.tw/image/getImage?i=https://www.books.com.tw/img/001/105/58/0011055852.jpg&amp;w=187&amp;h=187"></div>
<h4><a target="_blank" href="//x" title="Silent Witch (10) 沉默魔女的祕密"><em>Silent</em></a></h4>
<p class="author"><a rel='go_author' href='//x' title='依空まつり'>依空まつり</a><a rel='go_author' href='//y' title='藤実なんな'>x</a></p></div>`
  it('parses id, title, cover and authors', () => {
    const [r] = parseBooks(html)
    expect(r).toMatchObject({ id: '0011055852', title: 'Silent Witch (10) 沉默魔女的祕密', creators: '依空まつり、藤実なんな', url: 'https://www.books.com.tw/products/0011055852' })
    expect(r.cover).toBe('https://www.books.com.tw/img/001/105/58/0011055852.jpg')
  })
})

describe('Goodreads / Open Library', () => {
  it('parses autocomplete rows', () => {
    const [r] = parseGoodreads([{ bookId: '1', bookTitleBare: 'T', imageUrl: 'https://i.gr-assets.com/x._SY75_.jpg', bookUrl: '/book/show/1-t', author: { name: 'A' }, description: { html: 'a<br>b' } }])
    expect(r).toMatchObject({ id: '1', title: 'T', creators: 'A', summary: 'a\nb', cover: 'https://i.gr-assets.com/x.jpg', url: 'https://www.goodreads.com/book/show/1-t' })
  })
  it('parses Open Library docs', () => {
    const [r] = parseOpenLibrary({ docs: [{ key: '/works/OL1W', title: 'T', cover_i: 7, author_name: ['A', 'B'], first_publish_year: 1999, isbn: ['978'] }] })
    expect(r).toMatchObject({ id: '/works/OL1W', year: '1999', creators: 'A、B', isbn: '978' })
    expect(r.cover).toBe('https://covers.openlibrary.org/b/id/7-L.jpg')
  })
})

describe('detail page', () => {
  it('reads JSON-LD and ISBN', () => {
    const d = parseDetail(`<script type="application/ld+json">{"name":"x","description":"簡介","author":[{"name":"甲"},{"name":"乙"}],"isbn":"9786264350044","datePublished":"2022-05"}</script>`)
    expect(d).toMatchObject({ summary: '簡介', creators: '甲、乙', isbn: '9786264350044', year: '2022' })
  })
  it('falls back to og:description and page text', () => {
    const d = parseDetail('<meta property="og:description" content="內容 &amp; 介紹"> ISBN13：9786264006385')
    expect(d).toMatchObject({ summary: '內容 & 介紹', isbn: '9786264006385' })
  })
  it('reads the cover from og:image', () => {
    expect(parseDetail('<meta property="og:image" content="http://x.com/a.jpg">').cover).toBe('https://x.com/a.jpg')
  })
})

describe('slim', () => {
  it('keeps only title, cover, creators, type and link', () => {
    const r = slim({ source: 'bangumi', id: '1', title: 'T', originalTitle: 'O', cover: 'c', creators: 'A', year: '2022', summary: 's', isbn: '9', type: 'manga', url: 'u' })
    expect(r).toEqual({ source: 'bangumi', id: '1', title: 'T', cover: 'c', creators: 'A', type: 'manga', url: 'u' })
  })
})

import { refererFor } from './img.js'
describe('picture proxy host list', () => {
  it('lets Douban picture hosts through and nothing else', () => {
    expect(refererFor('https://img2.doubanio.com/view/subject/l/public/s1.jpg')).toContain('douban')
    expect(refererFor('http://img2.doubanio.com/a.jpg')).toBe('')
    expect(refererFor('https://evil.example.com/a.jpg')).toBe('')
    expect(refererFor('https://doubanio.com.evil.com/a.jpg')).toBe('')
    expect(refererFor('not a url')).toBe('')
  })
})

describe('巴哈姆特動畫瘋', () => {
  it('reads title, cover and episode count from a result card', () => {
    const html =
      "<div><a href='animeRef.php?sn=113826' class='theme-list-main' ><img class='theme-img lazyload' src='data:x' data-src='https://p2.bahamut.com.tw/B/ACG/c/67/0000140667.JPG' alt='x'><p class='theme-name'>Silent Witch 沉默魔女的祕密</p><p class='theme-time'>年份：2025/07</p><span class='theme-number'>\n共14集\n</span></a></div><a href='javascript:;' class='theme-list-main wish-card'>"
    expect(parseGamer(html)).toEqual([
      { source: 'gamer', id: '113826', title: 'Silent Witch 沉默魔女的祕密', cover: 'https://p2.bahamut.com.tw/B/ACG/c/67/0000140667.JPG', type: 'anime', eps: 14, year: '2025' },
    ])
  })
})

describe('BOOK☆WALKER', () => {
  it('reads a result card', () => {
    const html = `<div class="bookitem"><a href="https://www.bookwalker.com.tw/product/140166" title="x"><div class="bookcover"><img data-src="https://taiwan-image.bookwalker.com.tw/product/140166/140166_4.jpg" class="a"></div><h4 class="bookname" >Silent Witch (1) 沉默魔女的祕密</h4>
            <h5 class="booknamesub" >
                依空まつり/藤実なんな
            </h5></a></div>`
    expect(parseBookWalker(html)).toEqual([
      { source: 'bookwalker', id: '140166', title: 'Silent Witch (1) 沉默魔女的祕密', cover: 'https://taiwan-image.bookwalker.com.tw/product/140166/140166_4.jpg', creators: '依空まつり、藤実なんな', type: 'book', url: 'https://www.bookwalker.com.tw/product/140166' },
    ])
  })
})
