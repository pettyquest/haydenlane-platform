import { BRAND } from "@crewtavo/core/brand";

/**
 * The product's mark (Hayden Lane fork): the HL emblem from public/brand/mark-128.png, in the black
 * tile it was drawn on (.hl-mark in src/brand/theme.css). Swap the file to rebrand.
 */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return <img className={`hl-mark${className ? ` ${className}` : ""}`} src="/brand/mark-128.png" width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

/** Mark and name together, for the sidebar and sign-in pages. */
export function BrandLockup({ size = 28 }: { size?: number }) {
  return (
    <>
      <BrandMark size={size} />
      <span className="brand-name">{BRAND.name}</span>
    </>
  );
}
