/**
 * nolja 브랜드 로고 = 심볼 이미지 + 워드마크.
 * 워드마크는 그림이 아니라 실제 텍스트다 — 철자가 항상 정확하고, 폰트가 늦게 로드돼도
 * 글자는 그대로 읽히며, 확대해도 흐려지지 않는다.
 */

interface NoljaLogoProps {
  className?: string;
}

export function NoljaLogo({ className }: NoljaLogoProps) {
  return (
    <span className={className ? `nolja-logo ${className}` : 'nolja-logo'}>
      <img className="nolja-logo__mark" src="/nolja-mark.webp" alt="" width={128} height={128} />
      <span className="nolja-logo__word">nolja</span>
    </span>
  );
}
