import assert from 'node:assert/strict'
import { test } from 'node:test'
import { count, parsePage } from '../server/telegram/parse.ts'
import { jaccard, shingles } from '../server/telegram/engine.ts'

const PAGE = `
<div class="tgme_channel_info_header_title"><span dir="auto">Rybar in English</span></div>
<span class="counter_value">77.5K</span> <span class="counter_type">subscribers</span>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="rybar_in_english/34764">
<div class="tgme_widget_message_forwarded_from accent_color">Forwarded from&nbsp;<a class="tgme_widget_message_forwarded_from_name" href="https://t.me/News_of_Donbass/25256"><span dir="auto">DONBASS NEWS</span></a></div>
<a class="tgme_widget_message_photo_wrap blured" style="width:100px;background-image:url('https://cdn4.telesco.pe/file/abc.jpg')"></a>
<div class="tgme_widget_message_text js-message_text" dir="auto">Strike reported near Kharkiv<br/>Details via <a href="https://t.me/rybar">@rybar</a> and <a href="https://example.org/a?b=1&amp;c=2">source</a> @Some_bot</div>
<span class="tgme_widget_message_views">17.8K</span><time datetime="2026-10-03T20:00:00+00:00" class="time">20:00</time>
</div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="rybar_in_english/34765">
<div class="tgme_widget_message_text js-message_text" dir="auto">Second post text here</div>
<span class="tgme_widget_message_views">950</span><time datetime="2026-10-03T20:05:00+00:00" class="time">20:05</time>
</div></div>`

test('telegram preview parser: posts, views, forwards, mentions, media', () => {
  const p = parsePage(PAGE, 'rybar_in_english')
  assert.equal(p.title, 'Rybar in English')
  assert.equal(p.subscribers, 77500)
  assert.equal(p.posts.length, 2)
  const [a, b] = p.posts
  assert.equal(a.msgId, 34764)
  assert.equal(a.views, 17800)
  assert.equal(a.forwardedFrom, 'News_of_Donbass')
  assert.equal(a.media?.kind, 'photo')
  assert.equal(a.link, 'https://example.org/a?b=1&c=2')
  assert.deepEqual(a.mentions, ['rybar']) // bots and self are ignored
  assert.match(a.text, /Kharkiv\nDetails/)
  assert.equal(b.views, 950)
})

test('view counts', () => {
  assert.equal(count('1.2M'), 1200000)
  assert.equal(count('3.67K'), 3670)
  assert.equal(count('987'), 987)
  assert.equal(count('n/a'), undefined)
})

test('copy-paste detection survives emoji, links and small edits', () => {
  const a = shingles('⚡️ BREAKING: Ukrainian forces shelled a residential area in Donetsk, three civilians killed https://t.me/x/1 @chan')
  const b = shingles('BREAKING Ukrainian forces shelled a residential area in Donetsk, three civilians killed. Subscribe!')
  const c = shingles('Air defence active over Kyiv region, residents asked to stay in shelters until the all-clear')
  assert.ok(jaccard(a, b) >= 0.6)
  assert.ok(jaccard(a, c) < 0.1)
})
