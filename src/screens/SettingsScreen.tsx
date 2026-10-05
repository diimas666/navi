import {useState} from 'react';
import {Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {CompositeScreenProps} from '@react-navigation/native';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {
  Card,
  RangeBar,
  SectionLabel,
  SettingsRow,
  settingsColors,
} from '../components/settings/SettingsChrome';
import {resolveLanguage, settingsCopy} from '../i18n/settingsCopy';
import type {MainTabParamList, RootStackParamList} from '../navigation/types';
import {useObdStore} from '../store/obdStore';
import {useSettingsStore} from '../store/settingsStore';
import {useUiStore} from '../store/uiStore';
import {type} from '../theme/typography';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function SettingsScreen({navigation}: Props) {
  const settings = useSettingsStore();
  const obdReady = useObdStore(state => state.state === 'ready');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const t = settingsCopy(resolveLanguage(settings.language));
  const languageName =
    settings.language === 'ru' ? t.russian : settings.language === 'system' ? t.likeSystem : t.ukrainian;

  const invite = () => {
    Share.share({message: t.inviteMessage}).catch(() => undefined);
  };
  const writeSupport = (subject: string, body: string) => {
    const note = `${body}\n${t.versionLine}\n${Platform.OS} ${Platform.Version}`;
    const url = `mailto:uu36548@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(note)}`;
    Linking.openURL(url).catch(() => useUiStore.getState().showToast(t.mailFail));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.header}>{t.title}</Text>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.langHead}>
          <GlobeIcon />
          <Text style={styles.langHeadText}>{t.language}</Text>
        </View>
        <Card>
          <SettingsRow
            title={t.language}
            trailing={<Text style={styles.link}>{languageName}</Text>}
            onPress={() => setLanguageOpen(true)}
          />
          <Text style={styles.note}>{t.permissionNote}</Text>
        </Card>
        <ChoiceMenu
          open={languageOpen}
          value={settings.language}
          title={t.language}
          options={[
            {id: 'system', label: t.likeSystem},
            {id: 'uk', label: t.ukrainian},
            {id: 'ru', label: t.russian},
          ]}
          onClose={() => setLanguageOpen(false)}
          onSelect={language => {
            settings.setLanguage(language);
            setLanguageOpen(false);
          }}
        />

        <SectionLabel title={t.adapterSection} />
        <Card>
          <SettingsRow
            title={obdReady ? t.adapterOn : t.adapterOff}
            color={obdReady ? settingsColors.link : settingsColors.warn}
            onPress={() => navigation.navigate('OBD')}
            trailing={<Text style={styles.chevron}>›</Text>}
          />
          <Text style={styles.note}>{t.adapterNote}</Text>
          <SettingsRow
            title={t.connectAdapter}
            color={settingsColors.link}
            onPress={() => navigation.navigate('OBD')}
          />
          <SettingsRow
            title={t.whichAdapters}
            detail={t.adapterDetail}
            onPress={() => navigation.navigate('Adapters')}
            trailing={<Text style={styles.chevron}>›</Text>}
          />
        </Card>

        <IconHeading icon="map" title={t.mapSection} />
        <Card>
          <View style={styles.split}>
            <Text style={styles.ink}>{t.autoReturn}</Text>
            <Text style={styles.muted}>{settings.autoReturnSeconds} с</Text>
          </View>
          <RangeBar
            min={2}
            max={15}
            step={1}
            value={settings.autoReturnSeconds}
            onChange={settings.setAutoReturnSeconds}
          />
          <Text style={styles.note}>{t.autoReturnNote}</Text>
          <View style={styles.split}>
            <Text style={styles.ink}>{t.keepZoom}</Text>
            <Switch value={settings.keepManualZoom} onValueChange={settings.setKeepManualZoom} />
          </View>
          <View style={styles.split}>
            <Text style={styles.ink}>{t.baseZoom}</Text>
            <Text style={styles.muted}>{settings.baseZoom}</Text>
          </View>
          <RangeBar min={12} max={18} step={1} value={settings.baseZoom} onChange={settings.setBaseZoom} />
          <Text style={styles.note}>{t.zoomNote}</Text>
          <View style={styles.split}>
            <Text style={styles.ink}>{t.placeIcons}</Text>
            <Switch
              value={settings.placeIcons}
              onValueChange={settings.setPlaceIcons}
              trackColor={{false: '#E4E5EA', true: '#20B2AA'}}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={styles.note}>{t.placeIconsNote}</Text>
        </Card>

        <SectionLabel title={t.mapsSection} />
        <Card>
          <SettingsRow
            title={t.regionMaps}
            color={settingsColors.link}
            onPress={() => navigation.navigate('Maps')}
            trailing={<Text style={styles.chevron}>›</Text>}
          />
          <Text style={styles.note}>{t.regionNote}</Text>
        </Card>

        <SectionLabel title={t.againSection} />
        <Card>
          <SettingsRow
            title={t.showCoach}
            color={settingsColors.link}
            onPress={() => {
              settings.setMapCoach(true);
              navigation.navigate('Map');
            }}
          />
          <SettingsRow
            title={t.redo}
            color={settingsColors.link}
            onPress={() => {
              settings.setOnboarded(false);
              navigation.navigate('Onboarding');
            }}
          />
          <Text style={styles.note}>{t.redoNote}</Text>
        </Card>

        <IconHeading icon="lock" title={t.lockSection} />
        <Card>
          <ToggleRow
            icon="lock"
            title={t.lock}
            value={settings.autoLockParked}
            onChange={settings.setAutoLockParked}
          />
          <Text style={styles.note}>{t.lockNote}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              settings.setMapCoach(true);
              navigation.navigate('Map');
            }}
            style={styles.hintRow}>
            <BulbIcon />
            <Text style={styles.hintLabel}>{t.hints}</Text>
          </Pressable>
          <ToggleRow
            icon="unlock"
            title={t.unlock}
            value={settings.autoUnlockGps}
            onChange={settings.setAutoUnlockGps}
          />
          <Text style={styles.note}>{t.unlockNote}</Text>
        </Card>

        <IconHeading icon="plane" title={t.gpsSection} />
        <Card>
          <ToggleRow icon="plane" title={t.gpsCheck} value={settings.gpsCheck} onChange={settings.setGpsCheck} />
          <Text style={styles.note}>{t.gpsCheckNote}</Text>
        </Card>

        <SectionLabel title={t.dataSection} />
        <Card>
          <SettingsRow
            title={t.data}
            detail={t.dataDetail}
            onPress={() => navigation.navigate('Data')}
            trailing={<Text style={styles.chevron}>›</Text>}
          />
        </Card>

        <IconHeading icon="note" title={t.accuracy} />
        <Card>
          <Pressable accessibilityRole="button" onPress={() => settings.clearCalibration()} style={styles.resetRow}>
            <ResetIcon />
            <Text style={styles.resetLabel}>{t.resetCal}</Text>
          </Pressable>
          <Text style={styles.note}>{t.calNote}</Text>
        </Card>

        <Card>
          <SettingsRow title={t.invite} detail={t.inviteDetail} onPress={invite} />
        </Card>

        <SectionLabel title={t.supportSection} />
        <Card>
          <SettingsRow
            title={t.report}
            detail={t.reportDetail}
            onPress={() => writeSupport(t.bugSubject, t.bugBody)}
          />
          <SettingsRow
            title={t.review}
            detail={t.reviewDetail}
            onPress={() => writeSupport(t.reviewSubject, t.reviewBody)}
          />
          <SettingsRow title={t.idea} detail={t.ideaDetail} onPress={() => writeSupport(t.ideaSubject, t.ideaBody)} />
        </Card>

        <SectionLabel title={t.about} />
        <Card>
          <SettingsRow title={t.version} detail="1.0.0" />
          <Text style={styles.note}>{t.aboutNote}</Text>
          <SettingsRow
            title={t.terms}
            color={settingsColors.link}
            onPress={() => navigation.navigate('Legal', {document: 'terms'})}
            trailing={<Text style={styles.chevron}>›</Text>}
          />
          <SettingsRow
            title={t.privacy}
            color={settingsColors.link}
            onPress={() => navigation.navigate('Legal', {document: 'privacy'})}
            trailing={<Text style={styles.chevron}>›</Text>}
          />
          <Text style={styles.note}>{t.osm}</Text>
          <SettingsRow
            title={t.licenses}
            color={settingsColors.link}
            onPress={() => navigation.navigate('Licenses')}
            trailing={<Text style={styles.chevron}>›</Text>}
          />
          <SettingsRow
            title={settings.unit === 'kmh' ? t.unitKmh : t.unitMph}
            onPress={() => settings.setUnit(settings.unit === 'kmh' ? 'mph' : 'kmh')}
          />
          <SettingsRow
            title={t.theme}
            trailing={<Text style={styles.link}>{themeLabel(t, settings.theme)}</Text>}
            onPress={() => setThemeOpen(true)}
          />
        </Card>
        <ChoiceMenu
          open={themeOpen}
          value={settings.theme}
          title={t.theme}
          options={[
            {id: 'light', label: t.themeLight},
            {id: 'dark', label: t.themeDark},
            {id: 'system', label: t.themeSystem},
          ]}
          onClose={() => setThemeOpen(false)}
          onSelect={theme => {
            settings.setTheme(theme);
            setThemeOpen(false);
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: settingsColors.page},
  header: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: settingsColors.ink,
    paddingVertical: 8,
  },
  content: {paddingHorizontal: 16, paddingBottom: 130, gap: 4},
  note: {...type.caption, color: settingsColors.muted, paddingBottom: 6},
  link: {color: settingsColors.link, fontWeight: '700'},
  chevron: {color: settingsColors.muted, fontSize: 22},
  split: {minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  ink: {...type.body, color: settingsColors.ink, flex: 1},
  muted: {color: settingsColors.muted, fontWeight: '600'},
  langHead: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginLeft: 4, marginBottom: 8},
  langHeadText: {...type.bodyStrong, color: settingsColors.ink, fontSize: 17},
  globe: {width: 22, height: 22, alignItems: 'center', justifyContent: 'center'},
  globeRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.6,
    borderColor: '#8E8E93',
  },
  globeMeridian: {
    position: 'absolute',
    width: 8,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.4,
    borderColor: '#8E8E93',
  },
  globeParallel: {
    position: 'absolute',
    width: 16,
    height: 1.4,
    borderRadius: 1,
    backgroundColor: '#8E8E93',
  },
  scrim: {flex: 1},
  scrimFill: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  menu: {
    marginTop: 108,
    marginRight: 28,
    alignSelf: 'flex-end',
    width: 230,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: '#1C1430',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
  },
  menuTitle: {...type.bodyStrong, color: settingsColors.ink, paddingVertical: 8},
  menuRow: {minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8},
  menuCheck: {width: 16, color: settingsColors.ink, fontSize: 16, fontWeight: '700'},
  menuLabel: {...type.body, color: settingsColors.ink},
  iconHead: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8, marginLeft: 4},
  iconHeadText: {...type.bodyStrong, color: settingsColors.ink, fontSize: 17},
  resetRow: {minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10},
  resetLabel: {...type.bodyStrong, color: settingsColors.danger, flex: 1},
  hintRow: {minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10},
  hintLabel: {...type.bodyStrong, color: '#20B2AA', flex: 1},
  glyphBox: {width: 22, height: 22, alignItems: 'center', justifyContent: 'center'},
  shackle: {
    width: 10,
    height: 7,
    borderWidth: 1.6,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  shackleOpen: {transform: [{rotate: '-28deg'}], marginLeft: 4},
  pad: {width: 14, height: 8, borderRadius: 2, marginTop: -1},
  planeNose: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  planeWing: {width: 16, height: 2, borderRadius: 1, marginTop: -3},
  bulb: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#20B2AA'},
  bulbBase: {width: 6, height: 3, borderRadius: 1, backgroundColor: '#20B2AA', marginTop: 1},
  mini: {width: 18, height: 18, alignItems: 'center', justifyContent: 'center'},
  miniLeaf: {position: 'absolute', width: 7, height: 14, borderRadius: 2, backgroundColor: '#8E8E93'},
  miniLeft: {left: 1, transform: [{rotate: '-16deg'}]},
  miniRight: {right: 1, transform: [{rotate: '16deg'}]},
  noteIcon: {width: 14, height: 16, borderRadius: 2, borderWidth: 1.4, borderColor: '#8E8E93'},
  noteLine: {position: 'absolute', left: 3, width: 8, height: 1.3, borderRadius: 1, backgroundColor: '#8E8E93'},
  noteLineA: {top: 4},
  noteLineB: {top: 8},
  noteLineC: {top: 12},
  resetRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.8,
    borderColor: settingsColors.danger,
    borderTopColor: 'transparent',
  },
  resetArrow: {
    position: 'absolute',
    top: -1,
    right: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderBottomWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: settingsColors.danger,
  },
});

function IconHeading({icon, title}: {icon: 'map' | 'note' | 'lock' | 'plane'; title: string}) {
  return (
    <View style={styles.iconHead}>
      <RowGlyph kind={icon} color="#8E8E93" />
      <Text style={styles.iconHeadText}>{title}</Text>
    </View>
  );
}

function ToggleRow({
  icon,
  title,
  value,
  onChange,
}: {
  icon: 'lock' | 'unlock' | 'plane';
  title: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.split}>
      <RowGlyph kind={icon} color="#20B2AA" />
      <Text style={styles.ink}>{title}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{false: '#E4E5EA', true: '#20B2AA'}}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function RowGlyph({
  kind,
  color,
}: {
  kind: 'map' | 'note' | 'lock' | 'unlock' | 'plane';
  color: string;
}) {
  if (kind === 'map') {
    return <MiniMap />;
  }
  if (kind === 'note') {
    return <MiniNote />;
  }
  if (kind === 'plane') {
    return (
      <View style={styles.glyphBox}>
        <View style={[styles.planeNose, {borderBottomColor: color}]} />
        <View style={[styles.planeWing, {backgroundColor: color}]} />
      </View>
    );
  }
  return (
    <View style={styles.glyphBox}>
      <View style={[styles.shackle, kind === 'unlock' ? styles.shackleOpen : null, {borderColor: color}]} />
      <View style={[styles.pad, {backgroundColor: color}]} />
    </View>
  );
}

function BulbIcon() {
  return (
    <View style={styles.glyphBox}>
      <View style={styles.bulb} />
      <View style={styles.bulbBase} />
    </View>
  );
}

function MiniMap() {
  return (
    <View style={styles.mini}>
      <View style={[styles.miniLeaf, styles.miniLeft]} />
      <View style={[styles.miniLeaf, styles.miniRight]} />
    </View>
  );
}

function MiniNote() {
  return (
    <View style={styles.noteIcon}>
      <View style={[styles.noteLine, styles.noteLineA]} />
      <View style={[styles.noteLine, styles.noteLineB]} />
      <View style={[styles.noteLine, styles.noteLineC]} />
    </View>
  );
}

function themeLabel(copy: ReturnType<typeof settingsCopy>, theme: 'light' | 'dark' | 'system'): string {
  if (theme === 'light') {
    return copy.themeLight;
  }
  if (theme === 'dark') {
    return copy.themeDark;
  }
  return copy.themeSystem;
}

function ResetIcon() {
  return (
    <View style={styles.mini}>
      <View style={styles.resetRing} />
      <View style={styles.resetArrow} />
    </View>
  );
}

function GlobeIcon() {
  return (
    <View style={styles.globe}>
      <View style={styles.globeRing} />
      <View style={styles.globeMeridian} />
      <View style={styles.globeParallel} />
    </View>
  );
}

function ChoiceMenu<T extends string>({
  open,
  value,
  title,
  options,
  onClose,
  onSelect,
}: {
  open: boolean;
  value: T;
  title?: string;
  options: Array<{id: T; label: string}>;
  onClose: () => void;
  onSelect: (id: T) => void;
}) {
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.scrimFill} />
        <View style={styles.menu}>
          {title ? <Text style={styles.menuTitle}>{title}</Text> : null}
          {options.map(option => (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              onPress={() => onSelect(option.id)}
              style={styles.menuRow}>
              <Text style={styles.menuCheck}>{value === option.id ? '✓' : ''}</Text>
              <Text style={styles.menuLabel}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
