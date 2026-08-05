import type { ReactNode } from "react";
import Svg, { Circle, Path } from "react-native-svg";

// Exact path data transcribed from docs/design/poolpay-ui-kit.html's .tabbar
// icons (sections 02/07/08) — 24x24 viewBox, 2pt round-capped stroke, no fill.
function Icon({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function HomeTabIcon({ color }: { color: string }) {
  return (
    <Icon color={color}>
      <Path d="M4 11l8-7 8 7" />
      <Path d="M6 10v10h12V10" />
    </Icon>
  );
}

export function ActivityTabIcon({ color }: { color: string }) {
  return (
    <Icon color={color}>
      <Path d="M3 12h4l3-7 4 14 3-7h4" />
    </Icon>
  );
}

export function AlertsTabIcon({ color }: { color: string }) {
  return (
    <Icon color={color}>
      <Path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6" />
      <Path d="M10.3 19.5a2 2 0 003.4 0" />
    </Icon>
  );
}

export function ProfileTabIcon({ color }: { color: string }) {
  return (
    <Icon color={color}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c1.6-4 5-5 8-5s6.4 1 8 5" />
    </Icon>
  );
}
