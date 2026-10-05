import type {TextStyle} from 'react-native';

export const type = {
  display: {fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6} satisfies TextStyle,
  title: {fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4} satisfies TextStyle,
  headline: {fontSize: 20, lineHeight: 26, fontWeight: '700'} satisfies TextStyle,
  body: {fontSize: 16, lineHeight: 23, fontWeight: '400'} satisfies TextStyle,
  bodyStrong: {fontSize: 16, lineHeight: 22, fontWeight: '600'} satisfies TextStyle,
  caption: {fontSize: 13, lineHeight: 18, fontWeight: '500'} satisfies TextStyle,
  button: {fontSize: 17, lineHeight: 22, fontWeight: '700'} satisfies TextStyle,
  speed: {fontSize: 42, lineHeight: 46, fontWeight: '700', letterSpacing: -1} satisfies TextStyle,
};
