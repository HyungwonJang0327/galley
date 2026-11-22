import { describe, test, expect } from 'vitest';
import { sanitizeMarkup } from './markup.ts';

describe('sanitizeMarkup', () => {
  test('허용 태그·속성은 그대로 다시 쓴다(속성 표기 유지, 잎 태그는 스스로 닫음)', () => {
    const input =
      '<div class="card" style="left:28px;top:132px;transform:rotate(-3deg)"><h3><svg viewBox="0 0 24 24" width="26" height="26" fill="#2B2F36"><circle cx="12" cy="8" r="4.2"></circle><path d="M3 21 Q4 13 12 13 Z"/></svg>Guest</h3></div>';
    expect(sanitizeMarkup(input)).toBe(
      '<div class="card" style="left:28px;top:132px;transform:rotate(-3deg)"><h3><svg viewBox="0 0 24 24" width="26" height="26" fill="#2B2F36"><circle cx="12" cy="8" r="4.2" /><path d="M3 21 Q4 13 12 13 Z" /></svg>Guest</h3></div>',
    );
  });

  test('script·style은 내용째로, 주석·doctype도 버린다', () => {
    expect(
      sanitizeMarkup(
        '<!doctype html><!-- 메모 --><div>a<script>alert("x")</script><style>.c{color:red}</style>b</div>',
      ),
    ).toBe('<div>ab</div>');
    expect(sanitizeMarkup('<div>a<SCRIPT src="x.js">')).toBe('<div>a</div>');
  });

  test('모르는 태그는 태그만 버리고 글자는 남긴다 — img·a·iframe·use·foreignObject', () => {
    expect(
      sanitizeMarkup(
        '<a href="https://x.example">링크</a><img src="https://x.example/a.png"><svg><use href="#a"/><foreignObject><div>안</div></foreignObject><image href="x.png"/></svg>',
      ),
    ).toBe('링크<svg><div>안</div></svg>');
    expect(sanitizeMarkup('<iframe src="https://x.example">대체</iframe>끝')).toBe('끝');
  });

  test('이벤트·주소 속성과 목록에 없는 속성은 뺀다', () => {
    expect(
      sanitizeMarkup(
        '<div class="card" onclick="x()" id="a" data-x="1" href="https://x.example">a</div>',
      ),
    ).toBe('<div class="card">a</div>');
  });

  test.each([
    ['background:url(https://x.example/a.png)'],
    ['background:url("data:image/png;base64,AAAA")'],
    ['background: u\\72l(x)'],
    ['width:expression(alert(1))'],
    ['@import "x.css"'],
    ['background:url(//x.example/a)'],
    ['color:red;x:java\u0000script:alert(1)'],
    ['content:"&#106;avascript:"'],
  ])('위험한 값의 속성은 속성째로 뺀다: %s', (style) => {
    expect(sanitizeMarkup(`<div class="c" style='${style}'>a</div>`)).toBe(
      '<div class="c">a</div>',
    );
  });

  test('같은 문서의 필터·마커 참조 url(#id)는 허용', () => {
    expect(
      sanitizeMarkup(
        '<svg><rect filter="url(#soft)" width="10" height="10"/><path d="M0 0 H10" marker-end="url(#arrRed)"/></svg>',
      ),
    ).toBe(
      '<svg><rect filter="url(#soft)" width="10" height="10" /><path d="M0 0 H10" marker-end="url(#arrRed)" /></svg>',
    );
  });

  test('짝 없는 닫는 태그는 버리고 안 닫힌 태그는 끝에서 닫는다 — 바깥 틀을 깨지 못한다', () => {
    expect(sanitizeMarkup('</div></div><div class="card"><span>a')).toBe(
      '<div class="card"><span>a</span></div>',
    );
    expect(sanitizeMarkup('<div><span>a</div>b')).toBe('<div><span>a</span></div>b');
  });

  test('글자의 꺾쇠는 이스케이프, 엔티티는 그대로, 속성 값의 따옴표·꺾쇠도 이스케이프', () => {
    expect(sanitizeMarkup('<span>1 < 2 &amp; 3 > 2</span>')).toBe(
      '<span>1 &lt; 2 &amp; 3 &gt; 2</span>',
    );
    expect(sanitizeMarkup(`<span class='a"b<c'>x</span>`)).toBe(
      '<span class="a&quot;b&lt;c">x</span>',
    );
  });

  test('끝이 잘린 태그·따옴표는 글자로 떨어지고 태그가 되지 않는다', () => {
    expect(sanitizeMarkup('<div>a</div><div class="x')).toBe('<div>a</div>&lt;div class="x');
    expect(sanitizeMarkup('')).toBe('');
    expect(sanitizeMarkup('  \n ')).toBe('');
  });

  test('xmlns는 SVG 네임스페이스 값만 통과', () => {
    expect(sanitizeMarkup('<svg xmlns="http://www.w3.org/2000/svg" width="10"></svg>')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10"></svg>',
    );
    expect(sanitizeMarkup('<svg xmlns="https://x.example/ns"></svg>')).toBe('<svg></svg>');
  });

  test('같은 속성이 두 번이면 첫 번째만', () => {
    expect(sanitizeMarkup('<div class="a" class="b">x</div>')).toBe('<div class="a">x</div>');
  });
});
