/** One set of 16px outline icons (1.5px stroke) used across the app. Decorative: hidden from screen readers. */
const PATHS = {
  lot: 'M2.5 3.5h11v9h-11zM2.5 8h11M6.5 3.5v9',
  chart: 'M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5',
  book: 'M3 3.2c1.8-.5 3.6-.3 5 .8v8.5c-1.4-1.1-3.2-1.3-5-.8zM13 3.2c-1.8-.5-3.6-.3-5 .8v8.5c1.4-1.1 3.2-1.3 5-.8z',
  code: 'M6 4.5L2.5 8 6 11.5M10 4.5L13.5 8 10 11.5',
  file: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
  external: 'M6.5 3.5h-3v9h9v-3M9 2.5h4.5V7M13.5 2.5L7.5 8.5',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  close: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  pin: 'M8 14s4-3.7 4-7a4 4 0 10-8 0c0 3.3 4 7 4 7zM8 8.4a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8z',
  car: 'M3 10.5V8l1.2-3h7.6L13 8v2.5M2.5 10.5h11M4.5 12.5v-2M11.5 12.5v-2M4 8h8',
  signal: 'M8 9.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zM5.2 10.8a4 4 0 010-5.6M10.8 5.2a4 4 0 010 5.6M3.2 12.8a7 7 0 010-9.6M12.8 3.2a7 7 0 010 9.6',
  warning: 'M8 2.8l5.8 10H2.2zM8 7v3M8 11.6v.2',
  check: 'M3.5 8.5l3 3 6-7',
  chevron: 'M6 4l4 4-4 4',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
