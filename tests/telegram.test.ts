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

test('wikipedia current events: leaf items with their conflict chain and deaths', async () => {
  const { parseDay, fatalities } = await import('../server/providers/conflict/wikicurrent.ts')
  const html = `<div class="current-events-content description">
<p><b>Armed conflicts and attacks</b>
</p>
<ul><li><a href="/wiki/S">Sudanese civil war</a>
<ul><li><a href="/wiki/K">Kordofan campaign</a>
<ul><li>Eighteen people are killed in a drone strike on El Obeid. <a rel="nofollow" class="external text" href="https://example.org/x">(Al Jazeera)</a></li></ul></li></ul></li></ul>
<p><b>Sports</b>
</p>
<ul><li>A football match happens somewhere far away today.</li></ul>`
  const items = parseDay(html)
  assert.equal(items.length, 1)
  assert.deepEqual(items[0].context, ['Sudanese civil war', 'Kordofan campaign'])
  assert.equal(items[0].source, 'Al Jazeera')
  assert.equal(items[0].sourceUrl, 'https://example.org/x')
  assert.equal(fatalities(items[0].text), 18)
  assert.equal(fatalities('The death toll rises to 10.'), 10)
  assert.equal(fatalities('Talks resume in Doha.'), 0)
})

test('reader refuses private and non-http addresses (SSRF guard)', async () => {
  const { assertPublicUrl, isPrivateIp, framable } = await import('../server/reader/reader.ts')
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.equal(isPrivateIp(ip), true, ip)
  assert.equal(isPrivateIp('93.184.216.34'), false)
  await assert.rejects(assertPublicUrl('http://127.0.0.1/'))
  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest/meta-data'))
  await assert.rejects(assertPublicUrl('file:///etc/passwd'))
  await assert.rejects(assertPublicUrl('http://user:pw@example.org/'))
  assert.equal(framable(new Headers({ 'x-frame-options': 'DENY' })), false)
  assert.equal(framable(new Headers({ 'content-security-policy': "frame-ancestors 'self'" })), false)
  assert.equal(framable(new Headers({})), true)
})

test('telegram parser keeps the video URL', async () => {
  const { parsePage } = await import('../server/telegram/parse.ts')
  const html = `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="ch/9"><div class="tgme_widget_message_video_wrap"><video src="https://cdn4.telesco.pe/file/a.mp4?token=x&amp;y=1" class="tgme_widget_message_video"></video><time class="message_video_duration">0:42</time></div><div class="tgme_widget_message_text">A video post from the front line today</div><time datetime="2026-10-04T01:00:00+00:00"></time></div></div>`
  const [p] = parsePage(html, 'ch').posts
  assert.equal(p.media?.kind, 'video')
  assert.equal(p.media?.src, 'https://cdn4.telesco.pe/file/a.mp4?token=x&y=1')
  assert.equal(p.media?.duration, '0:42')
})
