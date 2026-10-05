import {useState} from 'react';
import {FlatList, Modal, Pressable, StyleSheet, Text, View} from 'react-native';

import {REGIONS} from '../constants/map';
import {resolveLanguage} from '../i18n/settingsCopy';
import {toAppError} from '../services/errors/AppError';
import {downloadRegion, removeRegion} from '../services/maps/OfflineMapService';
import {useMapStore} from '../store/mapStore';
import {useSettingsStore} from '../store/settingsStore';
import {useUiStore} from '../store/uiStore';
import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

const confirmCopy = {
  uk: {
    title: 'Видалити карту?',
    body: 'зникне з телефону. Завантажити можна знову.',
    confirm: 'Видалити',
    cancel: 'Скасувати',
    download: 'Завантажити',
  },
  ru: {
    title: 'Удалить карту?',
    body: 'исчезнет с телефона. Скачать можно снова.',
    confirm: 'Удалить',
    cancel: 'Отмена',
    download: 'Скачать',
  },
};

export function RegionDownloadList() {
  const {colors} = useTheme();
  const regions = useMapStore(state => state.regions);
  const language = useSettingsStore(state => state.language);
  const text = confirmCopy[resolveLanguage(language)];
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const pending = REGIONS.find(region => region.id === confirmId) ?? null;

  return (
    <>
    <FlatList
      data={REGIONS}
      keyExtractor={item => item.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      renderItem={({item}) => {
        const state = regions[item.id];
        const downloaded = state?.status === 'downloaded';
        const downloading = state?.status === 'downloading';
        const progress = downloading ? Math.max(0.02, Math.min(1, state?.progress ?? 0)) : downloaded ? 1 : 0;
        const percent = Math.round(progress * 100);
        const fill = {
          width: `${percent}%` as `${number}%`,
          backgroundColor: downloaded ? colors.success : colors.accent,
        };
        const actionStyle = downloaded
          ? {backgroundColor: colors.surfaceMuted}
          : {backgroundColor: colors.accentSoft};
        return (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <View style={styles.copy}>
              <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{item.name}</Text>
              <Text style={[type.caption, {color: colors.textSecondary}]}>
                {item.sizeMb} МБ
                {downloaded ? ' · на телефоні' : ''}
                {downloading ? ` · ${state?.detail ?? `${percent}%`}` : ''}
                {state?.error ? ` · ${state.error}` : ''}
              </Text>
              {downloading || downloaded ? (
                <View style={[styles.track, {backgroundColor: colors.border}]}>
                  <View style={[styles.fill, fill]} />
                </View>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={downloaded ? text.confirm : text.download}
              disabled={busy === item.id}
              onPress={() => {
                if (downloaded) {
                  setConfirmId(item.id);
                  return;
                }
                setBusy(item.id);
                downloadRegion(item)
                  .catch(error => useUiStore.getState().showToast(toAppError(error, 'OFFLINE_MAP_ERROR').userMessage))
                  .finally(() => setBusy(null));
              }}
              style={[downloaded ? styles.close : styles.action, actionStyle]}>
              {downloaded ? <CloseGlyph color={colors.textSecondary} /> : <DownloadGlyph color={colors.accent} />}
            </Pressable>
          </View>
        );
      }}
    />
    <Modal transparent visible={pending != null} animationType="fade" onRequestClose={() => setConfirmId(null)}>
      <View style={[styles.scrim, {backgroundColor: colors.scrim}]}>
        <Pressable accessibilityRole="button" onPress={() => setConfirmId(null)} style={styles.scrimFill} />
        <View style={[styles.dialog, {backgroundColor: colors.surface}]}>
          <Text style={[type.title, {color: colors.textPrimary}]}>{text.title}</Text>
          <Text style={[type.body, {color: colors.textSecondary}]}>
            {pending ? `${pending.name} ${text.body}` : ''}
          </Text>
          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmId(null)}
              style={[styles.dialogBtn, {backgroundColor: colors.surfaceMuted}]}>
              <Text style={[type.button, {color: colors.textPrimary}]}>{text.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy != null}
              onPress={() => {
                if (!confirmId) {
                  return;
                }
                const id = confirmId;
                setBusy(id);
                removeRegion(id)
                  .catch(error => useUiStore.getState().showToast(toAppError(error, 'OFFLINE_MAP_ERROR').userMessage))
                  .finally(() => {
                    setBusy(null);
                    setConfirmId(null);
                  });
              }}
              style={[styles.dialogBtn, {backgroundColor: colors.danger}, busy != null ? styles.dim : null]}>
              <Text style={[type.button, {color: colors.onAccent}]}>{text.confirm}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

function CloseGlyph({color}: {color: string}) {
  return (
    <View style={styles.cross}>
      <View style={[styles.crossBar, {backgroundColor: color, transform: [{rotate: '45deg'}]}]} />
      <View style={[styles.crossBar, {backgroundColor: color, transform: [{rotate: '-45deg'}]}]} />
    </View>
  );
}

function DownloadGlyph({color}: {color: string}) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.shaft, {backgroundColor: color}]} />
      <View style={[styles.head, {borderTopColor: color}]} />
      <View style={[styles.base, {backgroundColor: color}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {flex: 1},
  content: {gap: 10, paddingBottom: 12},
  card: {
    borderRadius: radius.md,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {flex: 1, gap: 6},
  track: {height: 6, borderRadius: radius.pill, overflow: 'hidden'},
  fill: {height: 6, borderRadius: radius.pill},
  action: {
    minWidth: 44,
    minHeight: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cross: {width: 14, height: 14, alignItems: 'center', justifyContent: 'center'},
  crossBar: {position: 'absolute', width: 14, height: 2, borderRadius: 1},
  scrim: {flex: 1, justifyContent: 'center', padding: 28},
  scrimFill: {...StyleSheet.absoluteFill},
  dialog: {borderRadius: radius.lg, padding: 20, gap: 12},
  dialogActions: {flexDirection: 'row', gap: 10, marginTop: 4},
  dialogBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: {opacity: 0.6},
  glyph: {width: 16, height: 16, alignItems: 'center'},
  shaft: {width: 2, height: 7, borderRadius: 1},
  head: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  base: {width: 14, height: 2, marginTop: 2, borderRadius: 1},
});
