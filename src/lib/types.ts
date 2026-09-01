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
  /** 所属するアルバムの ID。どこにも入っていない写真は null（＝未整理） */
  albumId: string | null;
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
  /** 共有アルバムの場合、この写真がサーバーに上がっているか */
  uploaded?: boolean;
}

/** ひとつの旅のアルバム。写真をまとめる入れ物で、利用者が作って名前を付ける。 */
export interface Album {
  id: string;
  /** 利用者が付けた名前。空のときは写真から作った候補名を表示する */
  title: string;
  note: string;
  /** 表紙にする写真。null なら自動で選ぶ */
  coverPhotoId: string | null;
  createdAt: number;
  updatedAt: number;

  /* --- 共有しているアルバムだけが持つ情報 --- */
  /** サーバー側のアルバム ID。null なら共有していない（この端末だけのアルバム） */
  remoteId?: string | null;
  /** 招待リンクに載せる合言葉 */
  inviteToken?: string | null;
  /** 自分が作ったのか、招待されて参加したのか */
  shareRole?: 'owner' | 'member' | null;
  lastSyncedAt?: number | null;
  /** 最後に同期したときの参加人数 */
  memberCount?: number | null;
}

/** 同じ場所・近い時刻でまとまった写真のかたまり（＝立ち寄りスポット） */
export interface Spot {
  id: string;
  albumId: string;
  photoIds: string[];
  startAt: number;
  endAt: number;
  lat: number | null;
  lon: number | null;
  place: Place | null;
  /** 自動生成した行動の推測（例: ランチ、観光） */
  activity: string;
}

/** アルバムに、写真から計算した中身（スポット・期間・表紙）を足した表示用のまとまり。 */
export interface AlbumView {
  album: Album;
  photoIds: string[];
  spots: Spot[];
  startAt: number;
  endAt: number;
  /** 写真の場所と日付から作った候補名。album.title が空のときに使う */
  suggestedTitle: string;
  coverPhotoId: string | null;
}

/** スポットの名前・メモ（スポットは写真から計算されるため、編集内容は別に持つ） */
export interface Edit {
  /** spot:<id> */
  key: string;
  title?: string;
  note?: string;
  coverPhotoId?: string;
  updatedAt: number;
}

export interface Settings {
  /** これ以上の間隔が空いたら別のスポットとみなす（分） */
  spotGapMinutes: number;
  /** これ以上離れたら別のスポットとみなす（メートル） */
  spotRadiusMeters: number;
  /** 地名の自動取得（OpenStreetMap へ座標を問い合わせる） */
  reverseGeocode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  spotGapMinutes: 90,
  spotRadiusMeters: 400,
  reverseGeocode: true,
};
