import {parseNavLink} from '../src/services/navigation/incomingLink';

describe('parseNavLink', () => {
  it('reads navi coordinates', () => {
    expect(parseNavLink('navi://navigate?lat=46.4825&lon=30.7233&q=Шаурма')).toEqual({
      latitude: 46.4825,
      longitude: 30.7233,
      name: 'Шаурма',
    });
  });

  it('reads geo with a name', () => {
    expect(parseNavLink('geo:46.48,30.72?q=Армійська 4')).toEqual({
      latitude: 46.48,
      longitude: 30.72,
      name: 'Армійська 4',
    });
  });

  it('reads geo query without a point', () => {
    expect(parseNavLink('geo:0,0?q=Приморський бульвар, Одеса')).toEqual({
      query: 'Приморський бульвар, Одеса',
      name: 'Приморський бульвар, Одеса',
    });
  });

  it('reads a Google destination', () => {
    expect(parseNavLink('https://www.google.com/maps/dir/?api=1&destination=46.48,30.72')).toEqual({
      latitude: 46.48,
      longitude: 30.72,
    });
  });

  it('reads Apple Maps daddr', () => {
    expect(parseNavLink('https://maps.apple.com/?daddr=46.48,30.72&q=Кафе')).toEqual({
      latitude: 46.48,
      longitude: 30.72,
      name: 'Кафе',
    });
  });

  it('reads a Waze point', () => {
    expect(parseNavLink('waze://?ll=46.48,30.72&navigate=yes')).toEqual({
      latitude: 46.48,
      longitude: 30.72,
    });
  });
});
