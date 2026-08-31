import type { Place } from './types';

/** OSM の種別 → 行動ラベル。前方の項目ほど優先される。 */
const TYPE_LABELS: Array<[RegExp, string]> = [
  [/^(restaurant|food_court|bbq|fast_food|noodle|ramen)$/, '食事'],
  [/^(cafe|coffee_shop|ice_cream|bakery|confectionery|patisserie)$/, 'カフェ'],
  [/^(bar|pub|nightclub|biergarten|izakaya)$/, '一杯'],
  [/^(hotel|hostel|guest_house|motel|ryokan|apartment|chalet|camp_site|caravan_site)$/, '宿'],
  [/^(onsen|spa|public_bath|hot_spring|sauna)$/, '温泉'],
  [/^(place_of_worship|shrine|temple|church|cathedral|mosque|monastery|torii)$/, 'お参り'],
  [
    /^(attraction|museum|gallery|artwork|theme_park|zoo|aquarium|castle|monument|memorial|ruins|archaeological_site|heritage|planetarium)$/,
    '観光',
  ],
  [/^(viewpoint|peak|volcano|ridge|cliff|waterfall|glacier|bay|cape|fjord)$/, '絶景'],
  [/^(beach|beach_resort|coastline)$/, 'ビーチ'],
  [/^(park|garden|national_park|nature_reserve|forest|wood|meadow|island)$/, '散策'],
  [
    /^(station|halt|subway_entrance|tram_stop|bus_station|bus_stop|aerodrome|terminal|ferry_terminal|harbour|rest_area|service_area|parking)$/,
    '移動',
  ],
  [
    /^(supermarket|mall|department_store|marketplace|convenience|clothes|books|souvenir|gift|bakery_shop|variety_store)$/,
    '買い物',
  ],
  [/^(stadium|sports_centre|pitch|golf_course|ski_resort|piste|swimming_pool|track)$/, 'アクティビティ'],
  [/^(theatre|cinema|arts_centre|community_centre|events_venue|concert_hall)$/, 'エンタメ'],
];

/** OSM の大分類 → 行動ラベル（種別で決まらなかったときの受け皿）。 */
const CATEGORY_LABELS: Record<string, string> = {
  tourism: '観光',
  historic: '観光',
  natural: '絶景',
  leisure: '散策',
  shop: '買い物',
  amenity: '立ち寄り',
  railway: '移動',
  aeroway: '移動',
  highway: '移動',
};

function timeLabel(hour: number): string {
  if (hour < 5) return '夜更け';
  if (hour < 10) return '朝';
  if (hour < 12) return '午前';
  if (hour < 15) return '昼';
  if (hour < 18) return '午後';
  if (hour < 21) return '夕方';
  return '夜';
}

/** 食事系は時間帯で呼び名を変える（12時台の restaurant → ランチ）。 */
function mealLabel(base: string, hour: number): string | null {
  if (base === '食事') {
    if (hour >= 5 && hour < 11) return '朝ごはん';
    if (hour >= 11 && hour < 15) return 'ランチ';
    if (hour >= 17 && hour < 23) return 'ディナー';
    return '食事';
  }
  if (base === 'カフェ' && hour >= 5 && hour < 11) return 'モーニング';
  if (base === '宿') {
    if (hour >= 21 || hour < 6) return '宿でひと休み';
    if (hour >= 6 && hour < 10) return '宿の朝';
    return 'チェックイン';
  }
  return null;
}

/**
 * 場所の種別と時間帯から「何をしていたか」を推測する。
 * あくまで見返すときの手がかりなので、確度が低いときは時間帯だけの控えめな表現にする。
 */
export function guessActivity(place: Place | null, startAt: number | null): string {
  const hour = startAt === null ? 12 : new Date(startAt).getHours();

  let base: string | null = null;
  if (place?.type) {
    for (const [pattern, label] of TYPE_LABELS) {
      if (pattern.test(place.type)) {
        base = label;
        break;
      }
    }
  }
  if (!base && place?.category) {
    base = CATEGORY_LABELS[place.category] ?? null;
  }

  if (base) return mealLabel(base, hour) ?? base;
  return `${timeLabel(hour)}のひととき`;
}
