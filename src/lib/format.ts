import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export const formatDate = (ms: number): string => format(ms, 'yyyy年M月d日(E)', { locale: ja });
export const formatShortDate = (ms: number): string => format(ms, 'M月d日', { locale: ja });
export const formatTime = (ms: number): string => format(ms, 'H:mm');
export const formatDateTime = (ms: number): string =>
  format(ms, 'yyyy年M月d日(E) H:mm', { locale: ja });
/** 同じ日をまとめるためのキー（ローカル時刻基準） */
export const dayKey = (ms: number): string => format(ms, 'yyyy-MM-dd');

/** 旅の期間を「6月14日 〜 6月16日」のように表す。 */
export function formatRange(startAt: number, endAt: number): string {
  if (!startAt) return '日時不明';
  const start = formatDate(startAt);
  if (dayKey(startAt) === dayKey(endAt)) return start;
  return `${start} 〜 ${formatShortDate(endAt)}`;
}

/** 滞在時間を「約 1 時間 20 分」のように表す。短すぎる場合は null。 */
export function formatDuration(startAt: number, endAt: number): string | null {
  const minutes = Math.round((endAt - startAt) / 60_000);
  if (minutes < 5) return null;
  if (minutes < 60) return `約${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `約${hours}時間` : `約${hours}時間${rest}分`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}
