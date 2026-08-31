/** 逆ジオコーディングで得られた場所の情報 */
export interface Place {
  /** 表示用の短い名前（例: 清水寺） */
  name: string;
  /** 市区町村（例: 京都市東山区） */
  city?: string;
  /** 都道府県・州（例: 京都府） */
  state?: string;
  /** 国（例: 日本） */
  country?: string;
  countryCode?: string;
  /** OSM の分類（例: tourism / amenity） */
  category?: string;
  /** OSM の種別（例: attraction / restaurant） */
  type?: string;
}

export interface Photo {
  id: string;
  fileName: string;
  /** 撮影日時（EXIF。無ければファイルの更新日時、それも無ければ null） */
  takenAt: number | null;
  /** 撮影日時をどこから得たか */
  takenAtSource: 'exif' | 'file' | 'none';
  lat: number | null;
  lon: number | null;
  /** 撮影方角（EXIF GPSImgDirection） */
  heading: number | null;
  width: number;
  height: number;
  /** 表示用に長辺 1600px へ縮小した画像 */
  full: Blob;
  /** 一覧用のサムネイル（長辺 400px） */
  thumb: Blob;
  cameraModel?: string;
  createdAt: number;
}

/** 同じ場所・近い時刻でまとまった写真のかたまり（＝立ち寄りスポット） */
export interface Spot {
  id: string;
  tripId: string;
  photoIds: string[];
  startAt: number;
  endAt: number;
  lat: number | null;
  lon: number | null;
  place: Place | null;
  /** 自動生成した行動の推測（例: ランチ、観光） */
  activity: string;
}

/** 連続した日程でまとまった写真のかたまり（＝ひとつの旅） */
export interface Trip {
  id: string;
  photoIds: string[];
  spots: Spot[];
  startAt: number;
  endAt: number;
  /** 自動生成したタイトル（ユーザー編集があればそちらが優先される） */
  autoTitle: string;
  coverPhotoId: string | null;
}

/** ユーザーが手で書き換えた内容（自動生成結果に上書きされないよう別管理） */
export interface Edit {
  /** trip:<id> または spot:<id> */
  key: string;
  title?: string;
  note?: string;
  coverPhotoId?: string;
  updatedAt: number;
}

export interface Settings {
  /** これ以上の間隔が空いたら別の旅とみなす（時間） */
  tripGapHours: number;
  /** これ以上の間隔が空いたら別のスポットとみなす（分） */
  spotGapMinutes: number;
  /** これ以上離れたら別のスポットとみなす（メートル） */
  spotRadiusMeters: number;
  /** 地名の自動取得（OpenStreetMap へ座標を問い合わせる） */
  reverseGeocode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  tripGapHours: 24,
  spotGapMinutes: 90,
  spotRadiusMeters: 400,
  reverseGeocode: true,
};
