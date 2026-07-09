// next/image shim — renders a plain <img>. The rr-app has no image optimizer,
// so we map Next's <Image> API onto a native element, honoring `fill` layout.
import { forwardRef } from 'react';

type NextImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | { src: string };
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  loader?: unknown;
  placeholder?: string;
  blurDataURL?: string;
  unoptimized?: boolean;
  sizes?: string;
};

const Image = forwardRef<HTMLImageElement, NextImageProps>(function Image(
  { src, fill, priority, quality, loader, placeholder, blurDataURL, unoptimized, style, ...rest },
  ref
) {
  const resolvedSrc = typeof src === 'string' ? src : src?.src;
  const resolvedStyle = fill
    ? {
        position: 'absolute' as const,
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover' as const,
        ...style,
      }
    : style;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={resolvedSrc} style={resolvedStyle} {...rest} />;
});

export default Image;
