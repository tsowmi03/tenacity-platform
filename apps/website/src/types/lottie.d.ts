declare namespace JSX {
  interface IntrinsicElements {
    "lottie-player": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      src?: string;
      background?: string;
      speed?: number;
      loop?: boolean;
      autoplay?: boolean;
    };
  }
}
