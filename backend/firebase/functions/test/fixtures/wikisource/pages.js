"use strict";
// RES-116. Trimmed copies of live Wikisource responses (2026-11-18).

const ozymandiasVersions = `{{similar|Ozymandias}}
{{versions
 | title    = Ozymandias
 | author   = Percy Bysshe Shelley
 | notes    = ''"Ozymandias" is a famous sonnet by Percy Bysshe Shelley, published in 1818.''
}}
* [[Ozymandias (draft manuscript)|Ozymandias draft manuscript]] (circa 1817)
* "[[Rosalind and Helen, A Modern Eclogue (1819)/Sonnet|Sonnet. Ozymandias]]", in ''[[Rosalind and Helen, A Modern Eclogue (1819)|Rosalind and Helen, A Modern Eclogue]]'' (1819)
[[Category:Sonnets]]`;

const ozymandiasDraft = `{{header | title = Ozymandias (draft manuscript) }}
<poem>I met a traveller from an antique land
Who said, &mdash; Two vast and trunkless legs of stone [or del.]
</poem>`;

const rosalindSonnet = `{{other versions|Ozymandias (Shelley)}}
{{header
 | title      = [[../|Rosalind and Helen, A Modern Eclogue]]
 | author     = Percy Bysshe Shelley
 | section    = Sonnet. Ozymandius.
}}

<pages index="Rosalind and Helen (Shelley).djvu" include=106 />

[[Category:Sonnets]]`;

const rosalindSonnetHtml = `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><div class="wst-header-mainblock">Rosalind and Helen</div>
<div class="prp-pages-output" lang="en">
<p><span><span class="pagenum ws-pagenum" id="106" data-page-number="106" title="Page:Rosalind and Helen (Shelley).djvu/106">&#8203;</span></span></p><div class="wst-center"><b>OZYMANDIAS.</b></div>
<div class="poem">
<p>I met a traveller from an antique land,<br>
Who said: &#8220;Two vast and trunkless legs of stone<br>
Stand in the desart. Near them, on the sand,<br>
Half sunk, a shattered visage lies, whose frown,<sup id="cite_ref-1" class="reference"><a href="#cite_note-1">[1]</a></sup><br>
And wrinkled lip, and sneer of cold command,<br>
Tell that its sculptor well those passions read,<br>
Which yet survive, stamped on these lifeless things,<br>
The hand that mocked them and the heart that fed:<br>
And on the pedestal these words appear:<br>
&#8216;My name is Ozymandias, king of kings:<br>
Look on my works, ye mighty, and despair!&#8217;<br>
Nothing beside remains. Round the decay<br>
Of that colossal wreck, boundless and bare<br>
The lone and level sands stretch far away.&#8221;
</p>
</div>
</div></div>`;

const searchResult = (titles) => JSON.stringify({ query: { search: titles.map((title) => ({ title })) } });

module.exports = { ozymandiasVersions, ozymandiasDraft, rosalindSonnet, rosalindSonnetHtml, searchResult };
