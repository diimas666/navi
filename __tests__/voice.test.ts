import {shouldAnnounce, announcePhase} from '../src/services/navigation/speakCue';

test('voice stays quiet when sound is off', () => {
  expect(shouldAnnounce(false, announcePhase(180, false), 'Поворот праворуч', '')).toBe(false);
});

test('voice speaks far, then closer, then on arrival', () => {
  expect(announcePhase(180, false)).toBe('far');
  expect(announcePhase(80, false)).toBe('near');
  expect(announcePhase(12, true)).toBe('arrive');
  expect(shouldAnnounce(true, 'far', 'Поворот праворуч', '')).toBe(true);
  expect(shouldAnnounce(true, 'far', 'Поворот праворуч', 'far:Поворот праворуч')).toBe(false);
  expect(shouldAnnounce(true, 'near', 'Поворот праворуч', 'far:Поворот праворуч')).toBe(true);
  expect(shouldAnnounce(true, 'arrive', 'Ви на місці', 'near:Поворот праворуч')).toBe(true);
});
