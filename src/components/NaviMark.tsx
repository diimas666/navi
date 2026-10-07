import {Image, StyleSheet} from 'react-native';

const mark = require('../assets/splash/mark.png');

type Props = {
  width?: number;
  height?: number;
};

export function NaviMark({width = 196, height = 196}: Props) {
  return <Image source={mark} resizeMode="contain" style={[styles.mark, {width, height}]} />;
}

const styles = StyleSheet.create({
  mark: {alignSelf: 'center'},
});
