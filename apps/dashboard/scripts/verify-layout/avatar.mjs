// Avatar 치수·원·이미지·접근성 실측.
// 갤러리(/design) Avatar 섹션의 data-demo("avatar-sizes"·"avatar-images")에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
// 전제: sizes는 [sm, md, lg] 순서(머리글자), images는 [로드되는 data: SVG(80×40 가로), 깨진 src] 순서, 전부 lg.

export async function verifyAvatar(page) {
  const name = 'Avatar 치수·원·이미지';
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) return { name, checks: [{ label: m.error, pass: false }] };

  const near = (a, b) => Math.abs(a - b) <= 1;
  const checks = [
    [
      `sm·md·lg가 토큰 24·32·40의 정사각형 (${m.sizes.map((s) => `${s.width}×${s.height}`).join(' · ')})`,
      m.sizes.length === 3 &&
        near(m.sizes[0].width, 24) &&
        near(m.sizes[1].width, 32) &&
        near(m.sizes[2].width, 40) &&
        m.sizes.every((s) => near(s.width, s.height)),
    ],
    [
      `전부 원이다 (반지름 ≥ 변 절반: ${m.sizes.map((s) => `${s.radius}/${s.height / 2}`).join(' · ')})`,
      m.sizes.every((s) => s.radius >= s.height / 2),
    ],
    [
      `머리글자가 원 안에 든다 (글자 폭 ${m.sizes.map((s) => s.textWidth).join(' · ')} ≤ 원)`,
      m.sizes.every((s) => s.textWidth <= s.width),
    ],
    [
      `루트가 role=img + aria-label (${m.sizes.map((s) => s.label).join(' · ')})`,
      m.sizes.every((s) => s.role === 'img' && s.label.length > 0),
    ],
    [`머리글자 글자는 aria-hidden (${m.hiddenInitials}/3)`, m.hiddenInitials === 3],
    [
      `이미지 아바타는 img가 원을 채우고(object-fit cover) alt="" (${m.image.width}×${m.image.height}, ${m.image.objectFit})`,
      m.image.present &&
        near(m.image.width, 40) &&
        near(m.image.height, 40) &&
        m.image.objectFit === 'cover' &&
        m.image.alt === '',
    ],
    [
      `가로 80×40 이미지가 원 밖으로 넘치지 않는다 (overflow ${m.image.overflow})`,
      m.image.overflow === 'hidden',
    ],
    [
      `깨진 이미지는 머리글자로 돌아간다 (img 없음, 글자 "${m.broken.text}")`,
      !m.broken.hasImg && m.broken.text === 'AL',
    ],
  ].map(([label, pass]) => ({ label, pass }));

  return { name, checks };
}

function measureExpression() {
  return `(async () => {
    const demo = (key) => document.querySelector('[data-demo="' + key + '"]');
    const sizes = demo('avatar-sizes');
    const images = demo('avatar-images');
    if (!sizes || !images) return JSON.stringify({ error: 'Avatar 데모를 찾지 못함' });
    sizes.scrollIntoView({ block: 'center' });
    // 깨진 이미지의 onerror가 처리될 시간을 준다.
    await new Promise((r) => setTimeout(r, 400));
    const round = (n) => Math.round(n * 100) / 100;
    const px = (v) => parseFloat(v);
    const sizeInfo = [...sizes.children].map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const text = el.firstElementChild;
      return {
        width: round(rect.width),
        height: round(rect.height),
        radius: px(style.borderTopLeftRadius),
        textWidth: text ? round(text.getBoundingClientRect().width) : 0,
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label') ?? '',
      };
    });
    const hiddenInitials = [...sizes.children].filter(
      (el) => el.firstElementChild && el.firstElementChild.getAttribute('aria-hidden') === 'true',
    ).length;
    const [withImage, broken] = [...images.children];
    const img = withImage.querySelector('img');
    const imgRect = img ? img.getBoundingClientRect() : { width: 0, height: 0 };
    return JSON.stringify({
      sizes: sizeInfo,
      hiddenInitials,
      image: {
        present: !!img,
        width: round(imgRect.width),
        height: round(imgRect.height),
        objectFit: img ? getComputedStyle(img).objectFit : '',
        alt: img ? img.getAttribute('alt') : null,
        overflow: getComputedStyle(withImage).overflow,
      },
      broken: { hasImg: !!broken.querySelector('img'), text: broken.textContent.trim() },
    });
  })()`;
}
