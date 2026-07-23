/**
 * 한판 브랜드 로고 = 심볼 이미지 + 워드마크.
 * 워드마크는 그림이 아니라 실제 텍스트다 — 글자가 항상 정확하고, 폰트가 늦게 로드돼도
 * 읽히며, 확대해도 흐려지지 않는다.
 */

interface HanpanLogoProps {
  className?: string;
}

export function HanpanLogo({ className }: HanpanLogoProps) {
  return (
    <span className={className ? `hanpan-logo ${className}` : 'hanpan-logo'}>
      <img className="hanpan-logo__mark" src="/hanpan-mark.webp" alt="" width={128} height={128} />
      <span className="hanpan-logo__word">한판</span>
    </span>
  );
}
