import Svg, {Circle, Defs, LinearGradient, Path, Polygon, Stop} from 'react-native-svg';

type Props = {
  width?: number;
  height?: number;
};

export function NaviMark({width = 210, height = 256}: Props) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 268">
      <Defs>
        <LinearGradient id="navi-gold" x1="34" y1="40" x2="110" y2="90" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#A67C2D" />
          <Stop offset="0.62" stopColor="#E0C173" />
          <Stop offset="1" stopColor="#F6E7B8" />
        </LinearGradient>
        <LinearGradient id="navi-ivory" x1="110" y1="20" x2="186" y2="150" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFFDF8" />
          <Stop offset="1" stopColor="#E4DCCE" />
        </LinearGradient>
        <LinearGradient id="navi-fold-left" x1="40" y1="120" x2="110" y2="168" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FBF7F0" />
          <Stop offset="1" stopColor="#EFE8DC" />
        </LinearGradient>
        <LinearGradient id="navi-fold-right" x1="180" y1="120" x2="110" y2="168" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#E7DFD1" />
          <Stop offset="1" stopColor="#D5CBBA" />
        </LinearGradient>
        <LinearGradient id="navi-arc" x1="36" y1="210" x2="184" y2="210" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#C6A45A" />
          <Stop offset="0.5" stopColor="#E4C98A" />
          <Stop offset="1" stopColor="#C6A45A" />
        </LinearGradient>
      </Defs>
      <Polygon points="110,8 52,130 110,116" fill="url(#navi-gold)" />
      <Polygon points="110,8 168,130 110,116" fill="url(#navi-ivory)" />
      <Polygon points="52,130 34,168 110,152 110,116" fill="url(#navi-fold-left)" />
      <Polygon points="168,130 186,168 110,152 110,116" fill="url(#navi-fold-right)" />
      <Circle cx="110" cy="206" r="11" fill="#F4EFE4" />
      <Path
        d="M36 188 C36 242 184 242 184 188"
        fill="none"
        stroke="url(#navi-arc)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </Svg>
  );
}
