import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const routes=['index','shop','about','faq','contact','policies/delivery','policies/returns','policies/privacy','policies/terms','cart','checkout','account','admin','404'];
for(const route of routes){
 const html=readFileSync(`dist/${route}.html`,'utf8');
 assert(html.includes('id="main"'),`${route}: missing rendered main content`);
 assert(html.includes('noindex,nofollow'),`${route}: indexing opened before launch`);
 assert(html.includes('public-catalog'),`${route}: missing public catalogue snapshot`);
}
assert(readFileSync('dist/robots.txt','utf8').includes('Disallow: /'));
assert(!readFileSync('dist/sitemap.xml','utf8').includes('<url>'));
console.log('Passed: 14 readable noindex pages, public catalogue snapshots, closed robots and empty sitemap.');
