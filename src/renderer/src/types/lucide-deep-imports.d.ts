declare module 'lucide-react/dist/esm/icons/*.js' {
  import type { SVGProps } from 'react';

  const Icon: (props: SVGProps<SVGSVGElement> & { size?: number | string }) => JSX.Element;
  export default Icon;
}
